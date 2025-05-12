import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

const ReactionBar = {
  props: ['itemId'],
  data() {
    return {
      emojis: ['👍', '❤️', '‼️'],
      reactions: {},
      reactionCounts: {}
    }
  },
  mounted() {
    const saved = localStorage.getItem(`reactions-${this.itemId}`);
    if (saved) {
      this.reactions = JSON.parse(saved);
    }
    this.updateReactionCounts();
  },
  methods: {
    toggleReaction(emoji) {
      if (this.reactions[emoji]) {
        delete this.reactions[emoji];
      } else {
        this.reactions[emoji] = true;
      }
      localStorage.setItem(`reactions-${this.itemId}`, JSON.stringify(this.reactions));
      this.updateReactionCounts();
    },
    isActive(emoji) {
      return this.reactions[emoji] === true;
    },
    updateReactionCounts() {
      this.reactionCounts = Object.keys(this.reactions).reduce((counts, emoji) => {
        counts[emoji] = this.reactions[emoji] ? 1 : 0;
        return counts;
      }, {});
    }
  },
  template: `
    <div class="reaction-bar">
      <button 
        v-for="emoji in emojis" 
        :key="emoji"
        @click="toggleReaction(emoji)"
        :class="['reaction-button', { active: isActive(emoji) }]">
        {{ emoji }} <span v-if="reactionCounts && reactionCounts[emoji]" class="reaction-count">{{ reactionCounts[emoji] }}</span>
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
      deletedChatIds: [],
      showEmojiPicker: false,
      emojis: ["😊", "👍", "❤️", "😂", "🎉", "🔥", "👏", "🤔", "😎", "🙏", 
         "✨", "🥰", "😍", "🤩", "😇", "🤣", "⭐", "🎊", "💯", "💖"],
      
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
      showDraftsMenu: false,
      
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
      },

      availableChats: [],
      visibleChats: [],
      chatRefreshKey: 0 
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
    },
    currentUserId() {
      return this.$graffitiSession.value?.actor || '';
    },
    currentUsername() {
      if (this.profileName) {
        return this.profileName;
      }
      
      if (this.currentUserId) {
        const parts = this.currentUserId.split('/');
        if (parts.length > 0) {
          return parts[parts.length - 1].substring(0, 8);
        }
      }
      
      return 'Guest';
    }
  },
  
  mounted() {
    this.$watch('$graffitiSession.value', (newSession, oldSession) => {
      if (!newSession) {
        this.clearUserData();
      } else if (newSession && (!oldSession || newSession.actor !== oldSession.actor)) {
        this.clearUserData();
        this.loadUserData(newSession.actor);
        
        this.$nextTick(() => {
          this.refreshChatDiscovery();
        });
      }
    }, { immediate: true });
  },

  watch: {
    activeTab: {
      handler(newTab) {
        if (newTab === 'drafts') {
          this.loadAvailableChats();
        }
        if (newTab === 'chats') {
          this.refreshChatDiscovery();
        }
      },
      immediate: true
    },
    currentChatId() {
      this.showDraftsMenu = false;
    },
    profileName(newName, oldName) {
      if (newName !== oldName && oldName) {
        this.updateChatNames();
      }
    }
  },
  
  methods: {
    getUserStorageKey(key, userId) {
      const id = userId || this.currentUserId;
      return `${id}-${key}`;
    },
    
    loadUserData(userId) {
      const savedProfile = localStorage.getItem(this.getUserStorageKey('chat-profile', userId));
      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile);
          this.profileName = profile.name || '';
          this.profilePicture = profile.picture || null;
          this.profileBirthday = profile.birthday || '';
          this.profileDescription = profile.description || '';
        } catch (e) {
          console.error("Error loading profile:", e);
        }
      }
      
      const savedDrafts = localStorage.getItem(this.getUserStorageKey('chat-drafts', userId));
      if (savedDrafts) {
        try {
          this.drafts = JSON.parse(savedDrafts);
        } catch (e) {
          console.error("Error loading drafts:", e);
          this.drafts = [];
        }
      } else {
        this.drafts = [];
      }
      
      const deletedChats = localStorage.getItem(this.getUserStorageKey('deleted-chats', userId));
      if (deletedChats) {
        try {
          this.deletedChatIds = JSON.parse(deletedChats);
        } catch (e) {
          console.error("Error loading deleted chats:", e);
          this.deletedChatIds = [];
        }
      } else {
        this.deletedChatIds = [];
      }
      
      const savedUserProfiles = localStorage.getItem(this.getUserStorageKey('user-profiles-cache', userId));
      if (savedUserProfiles) {
        try {
          this.userProfiles = JSON.parse(savedUserProfiles);
        } catch (e) {
          console.error("Error loading user profiles cache:", e);
          this.userProfiles = {};
        }
      } else {
        this.userProfiles = {};
      }
      
      this.loadAvailableChats();
    },
    
    async updateProfileInMessages(session, oldName, newName) {
      if (!session) return;
      
      const userChats = this.availableChats.map(chat => chat.channelId);
      
      for (const channelId of userChats) {
        console.log(`Updating user profile in channel ${channelId} from ${oldName} to ${newName}`);
      }
    },

    clearUserData() {
      this.profileName = "";
      this.profilePicture = null;
      this.profileBirthday = "";
      this.profileDescription = "";
      this.drafts = [];
      this.deletedChatIds = [];
      this.userProfiles = {};
      this.availableChats = [];
      this.visibleChats = [];
    },
    
    handleLogout() {
      this.saveProfile(this.$graffitiSession.value);
      this.saveDraftsToStorage();
      
      this.$graffiti.logout(this.$graffitiSession.value);
    },
    
    getUserChats(chatObjects) {
      if (!chatObjects) return [];
      if (!this.currentUserId) return [];
      const userCreatedChats = chatObjects.filter(chat => chat.actor === this.currentUserId);

      const nonDeletedChats = chatObjects.filter(chat => !this.isDeletedChat(chat.value.object.channel));
      
      const targetedChats = nonDeletedChats.filter(chat => {
        if (chat.actor === this.currentUserId) return false;
        
        const chatName = chat.value.object.name; 
        return this.isTargetedToCurrentUser(chatName);
      });
      
      return [...userCreatedChats, ...targetedChats];
    },
    
    isDeletedChat(channelId) {
      return this.deletedChatIds.includes(channelId);
    },
    
    loadAvailableChats() {
      this.availableChats = [];
      this.visibleChats = [];
    },

    isTargetedToCurrentUser(chatName) {
      if (!this.profileName) return false;
      
      return chatName.toLowerCase() === this.profileName.toLowerCase();
    },

    registerAvailableChats(chatObjects, nameUpdates) {
      if (!chatObjects || !nameUpdates) return;

      const userCreatedChats = chatObjects.filter(chat => 
        chat.actor === this.currentUserId && 
        !this.isDeletedChat(chat.value.object.channel)
      );
      
      const targetedChats = chatObjects.filter(chat => {
        if (this.isDeletedChat(chat.value.object.channel)) 
          return false;
        if (chat.actor === this.currentUserId) 
          return false; 
        
        const chatName = this.getLatestChatName(chat, nameUpdates);
        return this.isTargetedToCurrentUser(chatName);
      });
      
      this.visibleChats = targetedChats;
      
      const allVisibleChats = [...userCreatedChats, ...targetedChats];
      
      this.availableChats = allVisibleChats.map(chat => {
        return {
          channelId: chat.value.object.channel,
          name: this.getLatestChatName(chat, nameUpdates),
          isTargeted: chat.actor !== this.currentUserId,
          actor: chat.actor 
        };
      });
      
      console.log("Available chats updated:", this.availableChats);
      
      return true;
    },

    findChatByName(name) {
      return this.availableChats.find(chat => 
        chat.name.toLowerCase() === name.toLowerCase()
      );
    },
    
    async createChat(session) {
      if (!this.newChatName.trim() || !session) return;
      
      const channelId = crypto.randomUUID();
      const chatName = this.newChatName.trim();
    
      await this.$graffiti.put(
        {
          value: {
            activity: 'Create',
            object: {
              type: 'Group Chat',
              name: chatName,
              channel: channelId,
              creator: session.actor
            }
          },
          channels: this.channels
        },
        session
      );
      
      await this.$graffiti.put(
        {
          value: {
            name: chatName,
            describes: channelId
          },
          channels: this.channels
        },
        session
      );
      
      this.newChatName = "";
      this.enterChat(channelId, chatName);
    
      this.availableChats.push({
        channelId: channelId,
        name: chatName,
        isTargeted: false
      });
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
    
    insertEmoji(emoji) {
      this.newMessage += emoji;
      this.showEmojiPicker = false;
      this.$refs.messageInput.focus();
    },
    
    exitChat() {
      this.currentChatId = null;
      this.currentChatName = "";
      this.currentChatChannel = null;
      this.showDraftsMenu = false;
      
      this.$nextTick(() => {
        this.refreshChatDiscovery();
      });
    },
    
    refreshChatDiscovery() {
      this.availableChats = [];
      this.visibleChats = [];
      this.chatRefreshKey++;
    },
    
    async deleteChat(chatId, chatName, session) {
      if (!session) return;
      
      if (confirm(`Are you sure you want to delete the chat "${chatName}"?`)) {
        this.deletedChatIds.push(chatId);
        localStorage.setItem(this.getUserStorageKey('deleted-chats'), JSON.stringify(this.deletedChatIds));
        
        this.availableChats = this.availableChats.filter(chat => chat.channelId !== chatId);
        
        if (this.currentChatId === chatId) {
          this.exitChat();
        }
        
        this.$forceUpdate();
      }
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
                name: this.profileName || "Guest",
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
    
    updateChatNames() {
      if (!this.profileName) return;
      for (let i = 0; i < this.availableChats.length; i++) {
        const chat = this.availableChats[i];
        if (chat.isTargeted) {
          console.log(`Checking if chat ${chat.name} needs updating to ${this.profileName}`);
        }
      }
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
      
      const oldName = this.userProfiles[session.actor]?.name || '';
      const newName = this.profileName;
      
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
        
        // Save to user-specific storage
        localStorage.setItem(this.getUserStorageKey('chat-profile'), JSON.stringify({
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
        
        if (oldName !== newName && oldName) {
          await this.updateProfileInMessages(session, oldName, newName);
        }
        
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
      localStorage.setItem(this.getUserStorageKey('user-profiles-cache'), JSON.stringify(this.userProfiles));
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
      localStorage.setItem(this.getUserStorageKey('chat-drafts'), JSON.stringify(this.drafts));
    },
    
    async useDraft(draft) {
      if (!this.$graffitiSession.value) {
        alert("You need to be logged in to use drafts");
        return;
      }

      if (!draft.recipient.trim() || !draft.content.trim()) {
        alert("Draft recipient and content cannot be empty");
        return;
      }

      const existingChat = this.findChatByName(draft.recipient);

      if (existingChat) {
        this.enterChat(existingChat.channelId, existingChat.name);
        this.newMessage = draft.content;
        
        await this.$nextTick();
        await this.sendMessage(this.$graffitiSession.value);
        
        const draftIndex = this.drafts.findIndex(d => d.id === draft.id);
        if (draftIndex !== -1) {
          this.deleteDraft(draftIndex);
        }
      } else {
        this.newChatName = draft.recipient;
        await this.createChat(this.$graffitiSession.value);
        
        await this.$nextTick();
        this.newMessage = draft.content;
        await this.sendMessage(this.$graffitiSession.value);
        
        const draftIndex = this.drafts.findIndex(d => d.id === draft.id);
        if (draftIndex !== -1) {
          this.deleteDraft(draftIndex);
        }
      }

      this.switchTab('chats');
    },
    
    toggleDraftsMenu() {
      this.showDraftsMenu = !this.showDraftsMenu;
    },
    
    getRelevantDrafts() {
      if (!this.currentChatName) return [];
      
      return this.drafts.filter(draft => {
        return draft.recipient.toLowerCase() === this.currentChatName.toLowerCase();
      });
    },
    
    useDraftInCurrentChat(draft) {
      if (!this.$graffitiSession.value || !this.currentChatId) {
        return;
      }
      
      this.newMessage = draft.content;
      this.showDraftsMenu = false;
      
      this.$nextTick(() => {
        if (this.$refs.messageInput) {
          this.$refs.messageInput.focus();
        }
      });
      
      const draftIndex = this.drafts.findIndex(d => d.id === draft.id);
      if (draftIndex !== -1) {
        this.deleteDraft(draftIndex);
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
  }
});