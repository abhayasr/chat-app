import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

createApp({
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
      }
    };
  },
  
  computed: {
    channels() {
      return [this.baseChannel];
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
              timestamp: Date.now()
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
    

    formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    },
    

    isOwnMessage(message) {
      return message.actor === this.$graffitiSession.value.actor;
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
    
    findChatByName(name) {
      // Need to add implementation for this still
    },
    
    useDraft(draft) {
      // Need to add this too
      this.findChatByName(draft.recipient);
      
      this.newMessage = draft.content;
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