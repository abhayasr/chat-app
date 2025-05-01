import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

const ReactionBar = {
  props: ['itemId'],
  data() {
    return {
      emojis: ['👍', '❤️', '‼️'],
      reactions: {}
    }
  },
  mounted() {
    const saved = localStorage.getItem(`reactions-${this.itemId}`);
    if (saved) {
      this.reactions = JSON.parse(saved);
    }
  },
  methods: {
    toggleReaction(emoji) {
      if (this.reactions[emoji]) {
        delete this.reactions[emoji];
      } else {
        this.reactions[emoji] = true;
      }
      localStorage.setItem(`reactions-${this.itemId}`, JSON.stringify(this.reactions));
    },
    isActive(emoji) {
      return this.reactions[emoji] === true;
    }
  },
  template: `
    <div class="reaction-bar">
      <button 
        v-for="emoji in emojis" 
        :key="emoji"
        @click="toggleReaction(emoji)"
        :class="['reaction-button', { active: isActive(emoji) }]">
        {{ emoji }}
      </button>
    </div>
  `
}

const ProfileAvatar = {
  props: ['size', 'name', 'picture'],
  computed: {
    avatarStyle() {
      return {
        width: `${this.size}px`,
        height: `${this.size}px`,
        fontSize: `${Math.floor(this.size/2.5)}px`
      };
    },
    initial() {
      return this.name ? this.name.charAt(0).toUpperCase() : '?';
    }
  },
  template: `
    <div class="profile-avatar" :style="avatarStyle">
      <img v-if="picture" :src="picture" alt="Profile" />
      <div v-else class="placeholder">{{ initial }}</div>
    </div>
  `
}

createApp({
  components: {
    ReactionBar,
    ProfileAvatar
  },
  data() {
    return {
      baseChannel: "designftw",
      activeTab: "chats", 
      newChatName: "",
      editingMessageId: null,
      editedContent: "",
      newMessage: "",
      sending: false,
      currentChatId: null,
      currentChatName: "",
      currentChatChannel: null,
      newGroupName: "",
      isRenamingGroup: false,
      

      profileName: "",
      profilePicture: null,
      profileBirthday: "",
      profileDescription: "",
      selectedFile: null,


      userProfiles: {},

      drafts: [],
      newDraft: {
        recipient: "",
        content: ""
      },
      editingDraftIndex: null,
      
      chatSchema: {
        properties: {
          value: {
            required: ['activity', 'object'],
            properties: {
              activity: { const: 'Create' },
              object: {
                required: ['type', 'name', 'channel'],
                properties: {
                  type: { const: 'Group Chat' },
                  name: { type: 'string' },
                  channel: { type: 'string' }
                }
              }
            }
          }
        }
      },
      
      messageSchema: {
        properties: {
          value: {
            required: ['type', 'content', 'timestamp'],
            properties: {
              type: { const: 'message' },
              content: { type: 'string' },
              timestamp: { type: 'number' }
            }
          }
        }
      },
      
      groupNameSchema: {
        properties: {
          value: {
            required: ['name', 'describes'],
            properties: {
              name: { type: 'string' },
              describes: { type: 'string' }
            }
          }
        }
      },
      

      profileSchema: {
        properties: {
          value: {
            required: ['name'],
            properties: {
              name: { type: 'string' },
              picture: { type: 'string' },
              birthday: { type: 'string' },
              description: { type: 'string' }
            }
          }
        }
      }
    };
  },
  
  computed: {
    channels() {
      return [this.baseChannel];
    },
    formattedBirthday() {
      if (!this.profileBirthday) return "";
      try {
        const date = new Date(this.profileBirthday);
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      } catch (e) {
        return this.profileBirthday;
      }
    }
  },
  
  mounted() {
    const savedProfile = localStorage.getItem('chat-profile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      this.profileName = profile.name || '';
      this.profilePicture = profile.picture || null;
      this.profileBirthday = profile.birthday || '';
      this.profileDescription = profile.description || '';
    }
    
    this.loadDraftsFromStorage();
    
    const savedUserProfiles = localStorage.getItem('user-profiles-cache');
    if (savedUserProfiles) {
      try {
        this.userProfiles = JSON.parse(savedUserProfiles);
      } catch (e) {
        console.error("Error loading user profiles cache:", e);
        this.userProfiles = {};
      }
    }
  },
  
  methods: {
    async createChat(session) {
      if (!this.newChatName.trim() || !session) return;
      
      const channelId = crypto.randomUUID();
      
      await this.$graffiti.put(
        {
          value: {
            activity: 'Create',
            object: {
              type: 'Group Chat',
              name: this.newChatName,
              channel: channelId
            }
          },
          channels: this.channels
        },
        session
      );
      
      this.newChatName = "";
      this.enterChat(channelId, this.newChatName);
    },
    
    enterChat(channel, name) {
      this.currentChatId = channel;
      this.currentChatName = name;
      this.currentChatChannel = [channel];
      this.newGroupName = name;
      
      this.$nextTick(() => {
        if (this.$refs.messageInput) {
          this.$refs.messageInput.focus();
        }
      });
    },
    
    exitChat() {
      this.currentChatId = null;
      this.currentChatName = "";
      this.currentChatChannel = null;
    },
    
    async sendMessage(session) {
      if (!this.newMessage.trim() || !this.currentChatChannel || !session) return;
      
      this.sending = true;
      
      try {
        await this.$graffiti.put(
          {
            value: {
              type: "message",
              id: Date.now().toString(),
              content: this.newMessage,
              timestamp: Date.now(),
              userProfile: {
                name: this.profileName || "Anonymous",
                picture: this.profilePicture
              }
            },
            channels: this.currentChatChannel
          },
          session
        );
        
        this.newMessage = "";
        
        await this.$nextTick();
        if (this.$refs.messageInput) {
          this.$refs.messageInput.focus();
        }
      } catch (error) {
        console.error("Error sending message:", error);
      } finally {
        this.sending = false;
      }
    },

    startEditingMessage(message) {
      this.editingMessageId = message.url;
      this.editedContent = message.value.content;
    },
    
    cancelEditingMessage() {
      this.editingMessageId = null;
      this.editedContent = "";
    },
    
    async saveEditedMessage(message, session) {
      if (!this.editedContent.trim() || !session) return;
      
      try {
        await this.$graffiti.patch(
          {
            value: [
              {
                op: "replace",
                path: "/content",
                value: this.editedContent
              }
            ]
          },
          message,
          session
        );
        
        this.editingMessageId = null;
        this.editedContent = "";
      } catch (error) {
        console.error("Error editing message:", error);
      }
    },
    
    async deleteMessage(message, session) {
      if (!session) return;
      
      try {
        await this.$graffiti.delete(message, session);
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    },
    
    startRenamingGroup() {
      this.isRenamingGroup = true;
    },
    
    cancelRenamingGroup() {
      this.isRenamingGroup = false;
      this.newGroupName = this.currentChatName;
    },
    
    async saveGroupName(session) {
      if (!this.newGroupName.trim() || !this.currentChatId || !session) return;
      
      try {
        await this.$graffiti.put(
          {
            value: {
              name: this.newGroupName,
              describes: this.currentChatId
            },
            channels: this.channels
          },
          session
        );
        
        this.currentChatName = this.newGroupName;
        this.isRenamingGroup = false;
      } catch (error) {
        console.error("Error renaming group:", error);
      }
    },
    
    getLatestChatName(chatObj, nameUpdates) {
      const channelId = chatObj.value.object.channel;
      
      const updates = nameUpdates.filter(update => 
        update.value.describes === channelId
      ).sort((a, b) => b.timestamp - a.timestamp);
      
      return updates.length > 0 ? updates[0].value.name : chatObj.value.object.name;
    },
    
    handleFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      if (!file.type.match('image.*')) {
        alert('Please select an image file');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        this.profilePicture = e.target.result;
      };
      reader.readAsDataURL(file);
    },
    
    async saveProfile(session) {
      if (!session || !this.profileName.trim()) {
        alert("Please enter a display name");
        return;
      }
      
      try {
        await this.$graffiti.put(
          {
            value: {
              name: this.profileName,
              picture: this.profilePicture,
              birthday: this.profileBirthday,
              description: this.profileDescription
            },
            channels: this.channels
          },
          session
        );
        
        localStorage.setItem('chat-profile', JSON.stringify({
          name: this.profileName,
          picture: this.profilePicture,
          birthday: this.profileBirthday,
          description: this.profileDescription
        }));
        
        this.cacheUserProfile(session.actor, {
          name: this.profileName,
          picture: this.profilePicture,
          birthday: this.profileBirthday,
          description: this.profileDescription
        });
        
        alert("Profile saved successfully!");
      } catch (error) {
        console.error("Error saving profile:", error);
        alert("Error saving profile. Please try again.");
      }
    },
    
    getUserProfile(actorId) {
      if (this.$graffitiSession.value && actorId === this.$graffitiSession.value.actor) {
        return {
          name: this.profileName || actorId.substring(0, 8),
          picture: this.profilePicture,
          birthday: this.profileBirthday,
          description: this.profileDescription
        };
      }
      
      return this.userProfiles[actorId] || {
        name: actorId.substring(0, 8),
        picture: null
      };
    },
    
    cacheUserProfile(actorId, profile) {
      this.userProfiles[actorId] = profile;
      localStorage.setItem('user-profiles-cache', JSON.stringify(this.userProfiles));
    },
    
    isOwnMessage(message) {
      return message.actor === this.$graffitiSession.value.actor;
    },
    
    getUserName(message) {
      if (message.value.userProfile && message.value.userProfile.name) {
        return message.value.userProfile.name;
      }
      
      const profile = this.getUserProfile(message.actor);
      return profile.name || message.actor.substring(0, 8);
    },
    
    getUserPicture(message) {
      if (message.value.userProfile && message.value.userProfile.picture) {
        return message.value.userProfile.picture;
      }
      
      const profile = this.getUserProfile(message.actor);
      return profile.picture;
    },
    
    formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    },
    
    switchTab(tab) {
      this.activeTab = tab;
    },
    
    addDraft() {
      if (!this.newDraft.recipient.trim() || !this.newDraft.content.trim()) {
        return;
      }
      
      this.drafts.push({
        id: Date.now().toString(),
        recipient: this.newDraft.recipient,
        content: this.newDraft.content,
        createdAt: Date.now()
      });
      
      this.saveDraftsToStorage();
      
      this.newDraft = {
        recipient: "",
        content: ""
      };
    },
    
    editDraft(index) {
      this.editingDraftIndex = index;
      const draft = this.drafts[index];
      this.newDraft = {
        recipient: draft.recipient,
        content: draft.content
      };
    },
    
    updateDraft() {
      if (this.editingDraftIndex === null) return;
      
      if (!this.newDraft.recipient.trim() || !this.newDraft.content.trim()) {
        return;
      }
      
      this.drafts[this.editingDraftIndex] = {
        ...this.drafts[this.editingDraftIndex],
        recipient: this.newDraft.recipient,
        content: this.newDraft.content,
        updatedAt: Date.now()
      };

      this.saveDraftsToStorage();
      
      this.newDraft = {
        recipient: "",
        content: ""
      };
      this.editingDraftIndex = null;
    },
    
    cancelDraftEdit() {
      this.editingDraftIndex = null;
      this.newDraft = {
        recipient: "",
        content: ""
      };
    },
    
    deleteDraft(index) {
      this.drafts.splice(index, 1);
      this.saveDraftsToStorage();
    },
    
    saveDraftsToStorage() {
      localStorage.setItem('chat-drafts', JSON.stringify(this.drafts));
    },
    
    loadDraftsFromStorage() {
      const savedDrafts = localStorage.getItem('chat-drafts');
      if (savedDrafts) {
        this.drafts = JSON.parse(savedDrafts);
      }
    }
  }
})
.use(GraffitiPlugin, {
  graffiti: new GraffitiLocal(),
  // graffiti: new GraffitiRemote(),
})
.mount("#app");

document.addEventListener("DOMContentLoaded", function() {
  const app = document.querySelector("#app").__vue_app__;
  if (app && app._instance) {
    app._instance.proxy.loadDraftsFromStorage();
  }
});