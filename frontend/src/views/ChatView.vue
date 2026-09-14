<template>
  <div
    class="app-shell"
    @touchstart.passive="onSwipeTouchStart"
    @touchend.passive="onSwipeTouchEnd"
    @touchcancel.passive="onSwipeTouchCancel"
  >
    <!-- Sidebar with chat list -->
    <ChatSidebar
      ref="chatSidebarRef"
      :chat-id="chatId"
      :me="me"
      :app-version="appVersion"
      :online-users="onlineUsers"
      v-model:show-online-panel="showOnlinePanel"
      v-model:global-search-open="globalSearchOpen"
      :sidebar-hidden="sidebarHidden"
      @open-create="openCreate"
      @logout="logout"
      @navigate-chat="(id) => router.push(`/chats/${id}`)"
      @navigate-profile="router.push('/profile')"
      @open-user-profile="openUserProfile"
      @global-search-select="onGlobalSearchSelect"
    />

    <!-- Mobile: tap-outside backdrop behind the open sidebar -->
    <div
      class="sidebar-backdrop"
      :class="{ 'sidebar-backdrop--active': !sidebarHidden }"
      @click="sidebarHidden = true"
    />

    <!-- Main chat area -->
    <div
      class="chat-area"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
      @click="showEmojiPicker = false; closeReactionPicker(); showAttachMenu = false; showSendMenu = false; closeMobileMenu(); closeDesktopMenu()"
    >
      <!-- Drag-and-drop overlay -->
      <div v-if="dragging && !isAiChat" class="drop-overlay">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        Drop to attach
      </div>

      <!-- Header -->
      <div class="chat-header">
        <button class="sidebar-toggle" :title="sidebarHidden ? 'Show sidebar' : 'Hide sidebar'" @click="sidebarHidden = !sidebarHidden">
          <svg v-if="sidebarHidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><line x1="14" y1="9" x2="21" y2="9"/><line x1="14" y1="15" x2="21" y2="15"/></svg>
        </button>
        <UserAvatar
          :username="chatTitle"
          :avatarUrl="isGroup ? chat?.avatar_url : (peerUser?.avatar_url ?? null)"
          size="md"
          :shape="isGroup ? 'square' : 'circle'"
          style="cursor:pointer"
          @click="isGroup ? openGroupProfile() : peerUser ? openUserProfile(peerUser.username) : undefined"
        />
        <div class="chat-header-info" style="cursor:pointer" @click="isGroup ? openGroupProfile() : peerUser ? openUserProfile(peerUser.username) : undefined">
          <div class="chat-header-name">{{ chatTitle }}</div>
          <div class="chat-header-sub">
            <span v-if="!isGroup && peerUser">
              <span v-if="isPeerOnline" class="chat-header-online">● Online</span>
              <span v-else-if="peerUser.last_seen_at">Last seen {{ formatRelative(peerUser.last_seen_at) }}</span>
              <span v-else>Offline</span>
            </span>
            <span v-else-if="isGroup">{{ participants.length }} members<template v-if="onlineParticipantsCount > 0">, <span class="chat-header-online">{{ onlineParticipantsCount }} online</span></template></span>
          </div>
        </div>
        <div class="chat-header-actions">
          <button v-if="!isAiChat" class="btn-icon" :title="showMediaGallery ? 'Close gallery' : 'Media gallery'" :aria-label="showMediaGallery ? 'Close gallery' : 'Media gallery'" :class="{ active: showMediaGallery }" @click="showMediaGallery = !showMediaGallery">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button v-if="!isAiChat" class="btn-icon" :title="searchOpen ? 'Close search' : 'Search messages'" :aria-label="searchOpen ? 'Close search' : 'Search messages'" :style="searchOpen ? 'color:var(--accent)' : ''" @click="toggleSearch">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button v-if="!isAiChat" class="btn-icon" :title="isMuted(chatId) ? 'Unmute' : 'Mute'" :aria-label="isMuted(chatId) ? 'Unmute notifications' : 'Mute notifications'" :style="isMuted(chatId) ? 'color:var(--text-3)' : ''" @click="toggleMute(chatId)">
            <svg v-if="isMuted(chatId)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </div>
      </div>

      <!-- SSE reconnecting status bar -->
      <div v-if="sseStatus !== 'connected'" class="sse-status-bar">
        <span class="sse-spinner"></span>
        {{ sseStatus === 'reconnecting' ? 'Reconnecting…' : 'Connection error' }}
      </div>

      <!-- Search bar -->
      <div v-if="searchOpen && !isAiChat" class="msg-search-bar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          ref="searchInputEl"
          v-model="searchQuery"
          class="msg-search-input"
          placeholder="Search messages…"
          @input="onSearchInput"
          @keydown.escape="closeSearch"
          @keydown.up.prevent="navigateSearchResult(-1)"
          @keydown.down.prevent="navigateSearchResult(1)"
        />
        <button v-if="searchQuery" class="btn-icon" style="padding:4px" title="Clear" @click="searchQuery = ''; searchResults = []; searchLoading = false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div v-if="searchResults.length > 0" class="msg-search-nav">
          <span class="msg-search-counter">{{ searchIdx < 0 ? '0' : searchIdx + 1 }} / {{ searchResults.length }}</span>
          <button class="btn-icon" style="padding:3px" title="Previous result" @click="navigateSearchResult(-1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="btn-icon" style="padding:3px" title="Next result" @click="navigateSearchResult(1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>

      <!-- Search results panel -->
      <div v-if="searchOpen && !isAiChat && (searchLoading || searchQuery.trim().length >= 2)" class="msg-search-results">
        <div v-if="searchLoading" class="msg-search-status">Searching…</div>
        <template v-else>
          <div v-if="!searchResults.length" class="msg-search-status">No messages found for "{{ searchQuery.trim() }}"</div>
          <button
            v-for="(r, i) in searchResults"
            :key="r.id"
            class="msg-search-item"
            :class="{ 'msg-search-item--active': i === searchIdx }"
            @click="jumpToSearchResult(r.id)"
          >
            <UserAvatar :username="r.sender" :avatarUrl="r.sender_avatar_url" size="sm" />
            <div class="msg-search-item-info">
              <div class="msg-search-item-meta">
                <span class="msg-search-item-sender">{{ r.sender }}</span>
                <span class="msg-search-item-time">{{ formatTimeShort(r.created_at) }}</span>
              </div>
              <div class="msg-search-item-text"><span v-html="highlightText(r.content || '', searchQuery.trim())"></span></div>
            </div>
          </button>
        </template>
      </div>

      <!-- Global voice player bar -->
      <GlobalVoicePlayer />

      <!-- Pinned message bar -->
      <div v-if="currentPinned && !isAiChat" class="pinned-bar" @click="clickPinnedBar">
        <div class="pinned-bar-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>
        </div>
        <div class="pinned-bar-info">
          <span class="pinned-bar-label">Pinned{{ pinnedMessages.length > 1 ? ` ${pinnedIndex + 1} / ${pinnedMessages.length}` : '' }}</span>
          <span class="pinned-bar-content">{{ pinnedPreview(currentPinned) }}</span>
        </div>
        <div v-if="pinnedMessages.length > 1" class="pinned-nav-row">
          <button class="btn-icon pinned-nav-btn" title="Newer pinned" aria-label="Next pinned message" @click.stop="navigatePin(1)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="btn-icon pinned-nav-btn" title="Older pinned" aria-label="Previous pinned message" @click.stop="navigatePin(-1)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
        <button v-if="canPin" class="btn-icon pinned-nav-btn" style="flex-shrink:0" title="Unpin" aria-label="Unpin message" @click.stop="doPin(currentPinned.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Messages + Members panel wrapper -->
      <div style="display:flex;flex:1;min-height:0;overflow:hidden">
        <!-- Messages -->
        <div style="display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;position:relative">
          <div ref="listEl" class="messages-area" @scroll="onScroll">
            <div v-if="loadingMore" class="load-more-spinner">Loading…</div>

            <template v-if="chatLoading && !messages.length">
              <div class="skeleton-row"><div class="skeleton-bubble" style="width:60%"></div></div>
              <div class="skeleton-row own"><div class="skeleton-bubble" style="width:40%"></div></div>
              <div class="skeleton-row"><div class="skeleton-bubble" style="width:75%"></div></div>
              <div class="skeleton-row own"><div class="skeleton-bubble" style="width:50%"></div></div>
              <div class="skeleton-row"><div class="skeleton-bubble" style="width:65%"></div></div>
            </template>

            <!-- Chat load failure guard: show a retry prompt instead of blank area.
                 Only shown on fresh-load failure (chat is null, not loading, chatId set). -->
            <div
              v-else-if="!chat && !chatLoading && chatId && !isAiChat"
              class="chat-load-error"
            >
              <span class="chat-load-error-text">Could not load chat</span>
              <button class="btn btn-ghost" style="margin-top:10px" @click="load()">Retry</button>
            </div>

            <div class="message-group" v-else v-for="g in grouped" :key="g.key">
              <div class="date-separator">
                <span class="date-separator-text">{{ g.title }}</span>
              </div>

              <template v-for="(m, idx) in g.items" :key="m.id">
                <div v-if="unreadDividerBeforeId && m.id === unreadDividerBeforeId" class="unread-divider">
                  {{ unreadDividerCount }} new message{{ unreadDividerCount !== 1 ? 's' : '' }}
                </div>
                <div v-if="m.type === 'system'" class="system-notification">{{ m.content }}</div>
                <div
                  v-else
                  :id="`msg-${m.id}`"
                  class="message-row"
                  :class="{
                    own: isMine(m),
                    'same-sender': idx > 0 && g.items[idx-1].sender === m.sender && !g.items[idx-1].deleted_at,
                    'msg-highlighted': highlightedId === m.id,
                    'msg-new': newMessageIds.has(m.id),
                    'msg-selected': selectionMode && selectedMsgIds.has(m.id),
                  }"
                  @click.shift.stop="onMsgShiftClick(m.id)"
                  @click.exact="onMsgClick($event, m.id)"
                >
                  <!-- Selection checkbox -->
                  <div
                    v-if="selectionMode"
                    class="msg-select-checkbox"
                    :class="{ checked: selectedMsgIds.has(m.id) }"
                    @click.stop="toggleMsgSelection(m.id)"
                  >
                    <svg v-if="selectedMsgIds.has(m.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <!-- Avatar slot (others only) -->
                  <div class="message-avatar-slot">
                    <UserAvatar
                      v-if="!isMine(m) && (idx === g.items.length-1 || g.items[idx+1]?.sender !== m.sender)"
                      :username="m.sender"
                      :avatarUrl="m.sender_avatar_url"
                      size="sm"
                      style="cursor:pointer"
                      @click="openUserProfile(m.sender)"
                    />
                  </div>

                  <div class="message-bubble-wrap">
                    <!-- Sender name (group chats, others only) -->
                    <div v-if="isGroup && !isMine(m) && (idx === 0 || g.items[idx-1].sender !== m.sender)" class="message-sender-name" :style="{ color: senderColor(m.sender), cursor: 'pointer' }" @click="openUserProfile(m.sender)">
                      {{ m.sender }}
                    </div>

                    <div
                      class="message-bubble-outer"
                      :class="{ 'editing-active': editingId === m.id }"
                      :style="swipeMsgId === m.id ? { transform: `translateX(${msgSwipeX}px)`, transition: msgSwipeDone ? 'transform 0.25s cubic-bezier(0.25,1,0.5,1)' : 'none' } : {}"
                      @touchstart.passive="onMsgTouchStart($event, m)"
                      @touchend.passive="onMsgTouchEnd($event, m)"
                      @touchcancel.passive="onMsgTouchCancel()"
                      @contextmenu.prevent="openDesktopMenu($event, m)"
                    >
                      <!-- Swipe-to-reply icon (mobile only, revealed as bubble slides) -->
                      <div
                        v-if="!isAiChat && !m.deleted_at && m.type !== 'system'"
                        class="msg-swipe-icon"
                        :style="swipeMsgId === m.id && msgSwipeX > 0 ? { opacity: Math.min(msgSwipeX / 50, 1), transform: `translateY(-50%) scale(${0.4 + 0.6 * Math.min(msgSwipeX / 50, 1)})` } : { opacity: 0, transform: 'translateY(-50%) scale(0.4)' }"
                        aria-hidden="true"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      </div>
                        <div class="message-bubble" :class="{ deleted: !!m.deleted_at }">
                          <div class="message-body">
                          <div v-if="m.forwarded_from" class="forwarded-badge">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                            Forwarded from <strong>{{ m.forwarded_from }}</strong>
                          </div>
                          <div v-if="m.reply_to" class="reply-quote" @click.stop="jumpToMessage(m.reply_to.id)">
                            <span class="reply-quote-sender">{{ m.reply_to.sender }}</span>
                            <span class="reply-quote-content">{{ m.reply_to.deleted ? 'Message deleted' : replyPreview(m.reply_to) }}</span>
                          </div>
                          <span v-if="m.deleted_at" style="font-style:italic">Message deleted</span>
                          <template v-else>
                            <!-- Poll message -->
                            <PollMessage
                              v-if="m.type === 'poll' && m.poll"
                              :poll="m.poll"
                              :my-username="me?.username"
                              :allow-retraction="m.poll?.allow_retraction ?? false"
                              :chat-id="chatId"
                              @vote="doVotePoll(m.id, $event)"
                              @retract="doRetractPollVote(m.id)"
                              @show-results="openPollResults(m)"
                            />
                            <template v-else>
                            <span v-if="m.content" class="message-content" style="white-space:pre-wrap;word-break:break-word" v-html="renderContent(m.content)" @click.stop="onMessageContentClick($event)"></span>

                            <!-- Image grid -->
                            <template v-if="getAttachments(m).filter(a => a.type === 'image').length">
                              <div
                                class="attachment-grid"
                                :class="`count-${Math.min(getAttachments(m).filter(a => a.type === 'image').length, 4)}`"
                              >
                                <img
                                  v-for="(a, ai) in getAttachments(m).filter(a => a.type === 'image').slice(0, 4)"
                                  :key="ai"
                                  :src="a.url"
                                  :alt="a.name || 'Image attachment'"
                                  decoding="async"
                                  class="attachment-grid-img"
                                  @click="openLightbox(a.url)"
                                />
                              </div>
                            </template>

                            <!-- Non-image attachments -->
                            <template v-for="(a, ai) in getAttachments(m).filter(a => a.type !== 'image')" :key="ai">
                              <div class="attachment">
                                <video v-if="a.type === 'video'" :src="a.url" controls class="attachment-video"></video>
                                <AudioPlayer
                                  v-else-if="a.type === 'audio'"
                                  :src="a.url"
                                  :sender="m.sender || ''"
                                  :ref="el => { if (el) audioPlayerRefs[m.id] = el; else delete audioPlayerRefs[m.id] }"
                                  @ended="onAudioEnded(m.id)"
                                />
                                <a v-else :href="a.url" target="_blank" download class="attachment-file">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  {{ a.name || 'Download file' }}
                                </a>
                              </div>
                            </template>
                            <LinkPreview v-if="m.link_preview && !m.deleted_at" :preview="m.link_preview" />
                            </template><!-- end v-else (non-poll) -->
                          </template>
                          </div><!-- end message-body -->
                          <div class="message-meta">
                            <span class="message-time">{{ formatTime(m.created_at) }}</span>
                            <span v-if="m.edited_at && !m.deleted_at" class="message-edited">edited</span>
                            <span
                              v-if="isMine(m) && !m.deleted_at"
                              class="message-ticks"
                              :class="{ read: peerReadId && idLE(m.id, peerReadId), 'ticks-clickable': isGroup }"
                              @click.stop="isGroup && openReadBy(m.id)"
                            >
                              <template v-if="peerReadId && idLE(m.id, peerReadId)">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                  <path d="M2 13l3.5 3.5L13 9"/>
                                  <path d="M11 16.5L12.5 18 22 8.5"/>
                                </svg>
                              </template>
                              <template v-else-if="peerDeliveredId && idLE(m.id, peerDeliveredId)">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                  <path d="M2 13l3.5 3.5L13 9"/>
                                  <path d="M11 16.5L12.5 18 22 8.5"/>
                                </svg>
                              </template>
                            </span>
                          </div>
                        </div>
                    </div>

                    <!-- Reactions row -->
                    <div v-if="m.reactions && m.reactions.length" class="message-reactions">
                      <button
                        v-for="r in m.reactions"
                        :key="r.emoji"
                        class="reaction-pill"
                        :class="{ 'by-me': isMyReaction(m, r.emoji) }"
                        :title="r.users.join(', ')"
                        @click.stop="handleReactionClick(m, r.emoji, $event)"
                      >{{ r.emoji }} {{ r.count }}</button>
                      <button v-if="!isAiChat && !m.deleted_at" class="reaction-add-btn" title="Add reaction" aria-label="Add reaction" @click.stop="openReactionPicker(m.id, $event)">+</button>
                    </div>

                    <!-- DM read receipt timestamp -->
                    <div
                      v-if="isMine(m) && !isGroup && peerReadAt && peerReadId && m.id === peerReadId"
                      class="read-receipt-time"
                    >Read {{ formatTime(peerReadAt) }}</div>
                  </div>

                </div>
              </template>
            </div>
          </div>

          <button
            v-if="!isAiChat && !selectionMode"
            class="scroll-to-bottom"
            :class="{ hidden: !showScrollBtn }"
            @click="scrollToBottomFab"
            aria-label="Scroll to bottom"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            <span v-if="unreadWhileScrolled > 0" class="scroll-to-bottom-badge">{{ unreadWhileScrolled }}</span>
          </button>

          <!-- Typing indicator / inline error -->
          <div class="typing-indicator">
            <span v-if="isAiChat && aiLoading" class="ai-thinking">AI Assistant is thinking…</span>
            <span v-else-if="composerError" style="color:var(--danger);cursor:pointer" @click="composerError=''">⚠ {{ composerError }}</span>
            <span v-else-if="typingUser" class="typing-indicator-content">{{ typingUser }}&nbsp;<span class="typing-dots"><span></span><span></span><span></span></span></span>
          </div>

          <!-- Editing bar -->
          <div v-if="editingId" class="reply-bar editing-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span class="reply-bar-text">
              <strong style="color:var(--accent)">Editing</strong>{{ editingText ? ': ' + editingText : '' }}
            </span>
            <button class="btn-icon" style="padding:4px" aria-label="Cancel editing" title="Cancel editing" @click="cancelEdit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Reply bar -->
          <div v-if="replyingTo" class="reply-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            <span class="reply-bar-text">
              <strong>{{ replyingTo.sender }}</strong>{{ replyingTo.deleted ? ' · Message deleted' : ': ' + replyPreview(replyingTo) }}
            </span>
            <button class="btn-icon" style="padding:4px" aria-label="Cancel reply" title="Cancel reply" @click="cancelReply">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Pending files preview -->
          <div v-if="pendingFiles.length" class="reply-bar" style="flex-wrap:wrap;gap:8px;align-items:flex-start">
            <div
              v-for="(f, fi) in pendingFiles"
              :key="fi"
              style="position:relative;flex-shrink:0"
            >
              <img v-if="f.previewUrl" :src="f.previewUrl" :alt="f.name || 'Selected image preview'" decoding="async" style="height:52px;width:52px;object-fit:cover;border-radius:6px;display:block" />
              <div v-else style="height:52px;display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-2);max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {{ f.name }}
              </div>
              <!-- Upload progress bar -->
              <div
                v-if="f.progress !== undefined && f.progress < 100"
                class="upload-progress-bar"
                :style="{ width: f.progress + '%' }"
              ></div>
              <button
                class="btn-icon"
                style="position:absolute;top:-6px;right:-6px;background:var(--surface-2);border-radius:50%;width:18px;height:18px;padding:0;display:flex;align-items:center;justify-content:center"
                aria-label="Remove file"
                title="Remove file"
                @click="cancelFile(fi)"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <button class="btn-icon" style="padding:4px;align-self:center" title="Clear all" @click="cancelFile()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Selection action bar -->
          <div v-if="selectionMode" class="selection-bar">
            <span class="selection-count">{{ selectedMsgIds.size }} selected</span>
            <div class="selection-actions">
              <template v-if="!bulkDeleteConfirming">
                <button class="btn btn-secondary" @click="bulkForward">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  Forward
                </button>
                <button class="btn btn-danger" :disabled="!canDeleteSelected" @click="bulkDelete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Delete
                </button>
                <button class="btn btn-secondary" @click="exitSelectionMode">Cancel</button>
              </template>
              <template v-else>
                <span class="bulk-delete-confirm-label">Delete {{ selectedMsgIds.size }} message{{ selectedMsgIds.size !== 1 ? 's' : '' }}?</span>
                <button class="btn btn-danger" @click="bulkDelete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Confirm delete
                </button>
                <button class="btn btn-secondary" @click="bulkDeleteConfirming = false">Cancel</button>
              </template>
            </div>
          </div>

          <!-- Composer -->
          <div class="composer-wrap">
            <!-- Attach menu portal -->
            <Teleport to="body">
              <template v-if="showAttachMenu">
                <div class="floating-menu-backdrop" @click="showAttachMenu = false" @touchstart.prevent="showAttachMenu = false"></div>
                <div
                  class="attach-menu-portal"
                  :style="{ bottom: attachMenuPos.bottom + 'px', left: attachMenuPos.left + 'px' }"
                  @click.stop
                  @touchstart.stop
                >
                  <button class="attach-menu-item" @click="fileInputEl.click(); showAttachMenu = false">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    Attach file
                  </button>
                  <button class="attach-menu-item" @click="showPollForm = true; showAttachMenu = false">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="13" width="4" height="8" rx="1"/></svg>
                    Create poll
                  </button>
                </div>
              </template>
            </Teleport>
            <!-- Send menu portal -->
            <Teleport to="body">
              <template v-if="showSendMenu">
                <div class="floating-menu-backdrop" @click="showSendMenu = false" @touchstart.prevent="showSendMenu = false"></div>
                <div
                  class="send-menu-portal"
                  :style="{ bottom: sendMenuPos.bottom + 'px', right: sendMenuPos.right + 'px' }"
                  @click.stop
                  @touchstart.stop
                >
                  <button class="attach-menu-item" @click="showSendMenu = false; openSchedulePicker()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Schedule message
                  </button>
                </div>
              </template>
            </Teleport>
            <!-- Emoji picker for composer -->
            <Teleport to="body">
              <div
                v-if="showEmojiPicker"
                class="emoji-picker-portal"
                :style="{ left: emojiPickerPos.left + 'px', bottom: emojiPickerPos.bottom + 'px', transform: 'translateX(-50%)', top: 'auto' }"
                @click.stop
                @mousedown.stop
              >
                <EmojiPicker @select="onEmojiSelect" />
              </div>
            </Teleport>

            <!-- Reaction quick picker -->
            <Teleport to="body">
              <div
                v-if="reactionPickerMsgId"
                class="reaction-picker-portal"
                :style="{ left: reactionPickerPos.x + 'px', top: reactionPickerPos.y + 'px' }"
                @click.stop
                @mousedown.stop
              >
                <div v-if="!showFullReactionPicker" class="reaction-quick-pick">
                  <button
                    v-for="e in QUICK_REACTIONS"
                    :key="e"
                    class="reaction-quick-btn"
                    :class="{ active: isMyReaction(messages.find(m => m.id === reactionPickerMsgId), e) }"
                    @click.stop="doToggleReaction(reactionPickerMsgId, e); closeReactionPicker()"
                  >{{ e }}</button>
                  <button class="reaction-quick-btn reaction-more-btn" title="More emojis" @click.stop="showFullReactionPicker = true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  </button>
                </div>
                <EmojiPicker v-else @select="onEmojiSelect" />
              </div>
            </Teleport>

            <!-- Mobile long-press context menu -->
            <Teleport to="body">
              <div
                v-if="mobileMenu"
                class="mobile-ctx-overlay"
                @click="closeMobileMenu()"
                @touchstart.prevent="closeMobileMenu()"
              >
                <div
                  ref="mobileMenuEl"
                  class="mobile-ctx-menu"
                  :style="{ left: mobileMenu.x + 'px', top: mobileMenu.y + 'px', visibility: mobileMenu.adjusted ? 'visible' : 'hidden' }"
                  @click.stop
                  @touchstart.stop
                >
                  <!-- Quick reactions — always visible, never scrolled away -->
                  <div class="mobile-ctx-reactions">
                    <button
                      v-for="e in QUICK_REACTIONS"
                      :key="e"
                      class="mobile-ctx-reaction-btn"
                      :class="{ active: isMyReaction(mobileMenu.msg, e) }"
                      @click="doToggleReaction(mobileMenu.msg.id, e); closeMobileMenu()"
                    >{{ e }}</button>
                  </div>
                  <!-- Action items in a scrollable block so they never overflow off-screen -->
                  <div class="mobile-ctx-items">
                    <button class="mobile-ctx-item" @click="enterSelectionMode(mobileMenu.msg.id); closeMobileMenu()">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Select
                    </button>
                    <button class="mobile-ctx-item" @click="startReply(mobileMenu.msg); closeMobileMenu()">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      Reply
                    </button>
                    <button v-if="mobileMenu.msg.content" class="mobile-ctx-item" @click="copyMessageText(mobileMenu.msg)">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy
                    </button>
                    <button v-if="isMine(mobileMenu.msg) && mobileMenu.msg?.content && mobileMenu.msg?.type !== 'poll'" class="mobile-ctx-item" @click="startEdit(mobileMenu.msg); closeMobileMenu()">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button v-if="canPin" class="mobile-ctx-item" @click="doPin(mobileMenu.msg.id); closeMobileMenu()">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 0-2 2v8l-3 3v1h10v-1l-3-3V4a2 2 0 0 0-2-2z"/><line x1="12" y1="22" x2="12" y2="19"/></svg>
                      {{ pinnedMessages.some(p => p.id === mobileMenu.msg.id) ? 'Unpin' : 'Pin' }}
                    </button>
                    <button class="mobile-ctx-item" @click="startForward(mobileMenu.msg); closeMobileMenu()">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                      Forward
                    </button>
                    <button
                      v-if="mobileMenu.msg?.type === 'poll' && mobileMenu.msg?.poll?.allow_retraction && mobileMenu.msg?.poll?.my_votes?.length > 0"
                      class="mobile-ctx-item"
                      @click="doRetractPollVote(mobileMenu.msg.id); closeMobileMenu()"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                      Retract vote
                    </button>
                    <button v-if="isMine(mobileMenu.msg)" class="mobile-ctx-item mobile-ctx-danger" @click="removeMessage(mobileMenu.msg); closeMobileMenu()">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </Teleport>

            <!-- Desktop right-click context menu -->
            <Teleport to="body">
              <div
                v-if="desktopMenu"
                class="dctx-overlay"
                @click="closeDesktopMenu()"
                @contextmenu.prevent="closeDesktopMenu()"
              >
                <div
                  ref="desktopMenuEl"
                  class="dctx-menu"
                  :style="desktopMenuStyle"
                  @click.stop
                >
                  <!-- Quick reactions strip -->
                  <div class="dctx-reactions">
                    <button
                      v-for="e in QUICK_REACTIONS"
                      :key="e"
                      class="dctx-reaction-btn"
                      :class="{ active: isMyReaction(desktopMenu.msg, e) }"
                      @click="doToggleReaction(desktopMenu.msg.id, e); closeDesktopMenu()"
                    >{{ e }}</button>
                  </div>
                  <!-- Action items -->
                  <div class="dctx-items">
                    <button class="dctx-item" @click="enterSelectionMode(desktopMenu.msg.id); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Select
                    </button>
                    <button class="dctx-item" @click="startReply(desktopMenu.msg); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      Reply
                    </button>
                    <button v-if="desktopMenu.msg.content" class="dctx-item" @click="copyMessageText(desktopMenu.msg); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy text
                    </button>
                    <button v-if="!isAiChat && isMine(desktopMenu.msg) && desktopMenu.msg?.content && desktopMenu.msg?.type !== 'poll'" class="dctx-item" @click="startEdit(desktopMenu.msg); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button v-if="!isAiChat" class="dctx-item" @click="startForward(desktopMenu.msg); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                      Forward
                    </button>
                    <button v-if="canPin && !isAiChat" class="dctx-item" @click="doPin(desktopMenu.msg.id); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 0-2 2v8l-3 3v1h10v-1l-3-3V4a2 2 0 0 0-2-2z"/><line x1="12" y1="22" x2="12" y2="19"/></svg>
                      {{ pinnedMessages.some(p => p.id === desktopMenu.msg.id) ? 'Unpin' : 'Pin' }}
                    </button>
                    <button v-if="!isAiChat && !desktopMenu.msg.deleted_at" class="dctx-item" @click="openReactionPicker(desktopMenu.msg.id, desktopMenu.anchorEvent); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      Add reaction
                    </button>
                    <button
                      v-if="desktopMenu.msg?.type === 'poll' && desktopMenu.msg?.poll?.allow_retraction && desktopMenu.msg?.poll?.my_votes?.length > 0"
                      class="dctx-item"
                      @click="doRetractPollVote(desktopMenu.msg.id); closeDesktopMenu()"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                      Retract vote
                    </button>
                    <div v-if="isMine(desktopMenu.msg)" class="dctx-divider"></div>
                    <button v-if="isMine(desktopMenu.msg) && !isAiChat" class="dctx-item dctx-danger" @click="removeMessage(desktopMenu.msg); closeDesktopMenu()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      Delete message
                    </button>
                  </div>
                </div>
              </div>
            </Teleport>

          <div v-if="(composerLinkPreview || composerLinkPreviewLoading) && !composerLinkPreviewDismissed" class="composer-link-preview">
            <LinkPreview :preview="composerLinkPreview" :isLoading="composerLinkPreviewLoading" />
            <button class="composer-link-preview-close" @click="composerLinkPreviewDismissed = true; composerLinkPreview = null; composerLinkPreviewLoading = false" aria-label="Dismiss preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="composer">
            <!-- @mention popup -->
            <div v-if="mentionOpen && filteredMentions.length" class="mention-popup">
              <button
                v-for="(p, i) in filteredMentions"
                :key="p.id"
                class="mention-item"
                :class="{ 'mention-item--active': i === mentionIdx }"
                @mousedown.prevent="selectMention(p.username)"
              >
                <UserAvatar :username="p.username" :avatarUrl="p.avatar_url" size="sm" />
                <span class="mention-item-name">@{{ p.username }}</span>
              </button>
            </div>
            <!-- Normal mode -->
            <template v-if="!recording">
              <input ref="fileInputEl" type="file" multiple style="display:none" @change="onFileSelect" />
              <!-- Attach menu -->
              <div v-if="!isAiChat" class="attach-menu-wrap">
                <button
                  ref="attachBtnEl"
                  class="btn-icon composer-attach"
                  :class="{ active: showAttachMenu }"
                  title="Attach file"
                  aria-label="Attach file"
                  :disabled="uploading"
                  @click.stop="toggleAttachMenu()"
                >
                  <svg v-if="!uploading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                </button>
              </div>
              <div class="composer-pill">
              <textarea
                ref="composerEl"
                v-model="input"
                class="composer-input"
                placeholder="Type a message…"
                rows="1"
                @keydown="onKeydown"
                @input="onTyping"
              />
              <span
                v-if="input.length > 3500"
                class="char-counter"
                :class="{
                  'char-counter--danger': input.length > 4000,
                  'char-counter--warning': input.length > 3800 && input.length <= 4000,
                  'char-counter--ok': input.length <= 3800
                }"
              >{{ 4000 - input.length }}</span>
              <button
                ref="emojiButtonEl"
                class="btn-icon composer-emoji"
                :class="{ active: showEmojiPicker }"
                title="Emoji"
                aria-label="Open emoji picker"
                @click.stop="toggleEmojiPicker"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <circle cx="9" cy="9.5" r="1.5" fill="currentColor" stroke="none"/>
                  <circle cx="15" cy="9.5" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <button
                v-if="!isAiChat && scheduledMessages.length > 0"
                class="btn-icon composer-clock"
                :title="`Scheduled (${scheduledMessages.length})`"
                @click="showScheduledList = true"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span class="composer-clock-badge">{{ scheduledMessages.length }}</span>
              </button>
              </div>
              <div v-if="!isAiChat" class="composer-action-wrap send-menu-wrap">
                <button
                  class="composer-mic composer-action-btn btn-icon"
                  :class="{ 'btn-hidden': input.trim() || pendingFiles.length }"
                  title="Record voice message"
                  aria-label="Record voice message"
                  :disabled="uploading"
                  @click="startRecording"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                </button>
                <button
                  ref="sendBtnEl"
                  class="composer-send composer-action-btn"
                  :class="{ 'btn-hidden': !input.trim() && !pendingFiles.length }"
                  :disabled="!input.trim() && !pendingFiles.length"
                  aria-label="Send message"
                  @click="send"
                  @contextmenu.prevent="openSendMenu()"
                  @touchstart="onSendTouchStart"
                  @touchend="onSendTouchEnd"
                  @touchmove="onSendTouchEnd"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <button v-else class="composer-send" :disabled="!input.trim() || aiLoading" @click="send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </template>

            <!-- Recording mode -->
            <template v-else>
              <span class="recording-dot"></span>
              <span class="recording-time">{{ fmtRecTime(recordingTime) }}</span>
              <div v-if="waveformBars.length" class="voice-waveform">
                <span
                  v-for="(h, i) in waveformBars"
                  :key="i"
                  class="waveform-bar"
                  :style="{ height: h + 'px' }"
                ></span>
              </div>
              <span v-else style="flex:1" />
              <button class="btn-icon" style="color:var(--danger);padding:6px 8px" title="Cancel" @click="cancelRecording">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button class="composer-send" title="Send voice message" @click="sendRecording">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </template>
          </div>
          </div><!-- /composer-wrap -->
        </div>

      </div>
    </div>

    <!-- Group profile modal -->
    <GroupProfileModal
      v-if="showGroupProfile && isGroup && chat"
      :chat="chat"
      :participants="participants"
      :me="me"
      :onlineUsers="onlineUsers"
      @close="showGroupProfile = false"
      @updated="onGroupUpdated($event)"
      @member-added="onGroupMembersChanged($event)"
      @member-removed="onGroupMembersChanged($event)"
      @left="chatSidebarRef?.removeSidebarChat(chatId); router.push('/')"
      @deleted="chatSidebarRef?.removeSidebarChat(chatId); router.push('/')"
      @open-user="openUserProfile($event)"
      @open-media="showGroupProfile = false; showMediaGallery = true"
    />

    <!-- User profile modal -->
    <UserProfileModal
      v-if="profileUsername"
      :username="profileUsername"
      :sidebarChats="chatSidebarRef?.sidebarChats || []"
      :chatId="isAiChat ? null : chatId"
      @close="profileUsername = null"
      @open-chat="(id) => { profileUsername = null; router.push(`/chats/${id}`) }"
      @go-profile="router.push('/profile')"
      @open-media="profileUsername = null; showMediaGallery = true"
    />

    <!-- Image lightbox -->
    <ImageLightbox
      v-if="lightboxOpen"
      :images="allImages"
      :index="lightboxIndex"
      @close="lightboxOpen = false"
      @navigate="lightboxIndex = $event"
    />

    <!-- Media gallery panel -->
    <MediaGallery
      v-if="showMediaGallery && !isAiChat"
      :chatId="chatId"
      @close="showMediaGallery = false"
    />

    <!-- Forward modal -->
    <div v-if="showForwardModal" class="modal-overlay" @click.self="showForwardModal = false">
      <div ref="forwardModalEl" class="modal" role="dialog" aria-modal="true" aria-label="Forward message">
        <div class="modal-header">
          <span class="modal-title">Forward to…</span>
          <button class="btn-icon" aria-label="Close" @click="showForwardModal = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" style="padding:0;max-height:360px;overflow-y:auto">
          <button
            v-for="c in (chatSidebarRef?.sidebarChats || [])"
            :key="c.id"
            class="forward-chat-item"
            @click="doForward(c.id)"
          >
            <UserAvatar :username="c.display_name || c.id" :avatarUrl="c.avatar_url || null" size="sm" />
            <span class="forward-chat-name">{{ c.display_name || c.id }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- New chat modal -->
    <div v-if="showCreate" class="modal-overlay" @click.self="closeCreate">
      <div ref="createModalEl" class="modal" role="dialog" aria-modal="true" aria-label="New conversation">
        <div class="modal-header">
          <span class="modal-title">New conversation</span>
          <button class="btn-icon" aria-label="Close" @click="closeCreate">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="toggle-tabs">
            <div class="toggle-tab" :class="{ active: !createIsGroup }" @click="createIsGroup = false; selectedUsers = []">Direct</div>
            <div class="toggle-tab" :class="{ active: createIsGroup }" @click="createIsGroup = true; selectedUsers = []">Group</div>
          </div>
          <div v-if="createIsGroup">
            <label class="form-label">Title</label>
            <input v-model="createTitle" class="input" placeholder="Group name" />
          </div>
          <div>
            <label class="form-label">{{ createIsGroup ? 'Participants' : 'Username or email' }}</label>
            <div v-if="createIsGroup && selectedUsers.length" class="user-chips">
              <span v-for="u in selectedUsers" :key="u.username" class="user-chip">
                {{ u.username }}
                <button type="button" class="user-chip-remove" @click="removeUser(u.username)">×</button>
              </span>
            </div>
            <div style="position:relative">
              <input
                v-model="userSearchQuery"
                class="input"
                :placeholder="createIsGroup ? 'Search users…' : 'Search by username or email'"
                autocomplete="off"
                @input="onUserSearchInput"
                @focus="showSuggestions = userSuggestions.length > 0"
                @blur="onSearchBlur"
              />
              <div v-if="showSuggestions && userSuggestions.length" class="user-suggestions">
                <button
                  v-for="u in userSuggestions"
                  :key="u.username"
                  type="button"
                  class="user-suggestion-item"
                  @mousedown.prevent
                  @click="selectUser(u)"
                >
                  <span class="user-suggestion-avatar">{{ u.username[0].toUpperCase() }}</span>
                  <span class="user-suggestion-name">{{ u.username }}</span>
                </button>
              </div>
            </div>
          </div>
          <div v-if="createError" class="auth-error" style="margin:0">{{ createError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeCreate">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="creating || (selectedUsers.length === 0 && !userSearchQuery.trim()) || (createIsGroup && !createTitle.trim())"
            @click="createChat"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Poll form modal -->
    <PollForm
      v-if="showPollForm"
      @close="showPollForm = false"
      @submit="submitPoll"
    />

    <ScheduledMessagesModal
      v-if="showScheduledList"
      :items="scheduledMessages"
      @close="showScheduledList = false"
      @updated="onScheduledUpdated"
      @deleted="onScheduledDeleted"
    />

    <SchedulePickerModal
      v-if="showSchedulePicker"
      @close="showSchedulePicker = false"
      @submit="onSchedulePicked"
    />

    <!-- Poll results modal -->
    <PollResultsModal
      v-if="pollResultsMsg?.poll"
      :poll="pollResultsMsg.poll"
      @close="pollResultsMsg = null"
    />

    <!-- Toast notification -->
    <Transition name="toast-fade">
      <div v-if="toastMsg" class="toast" :class="`toast--${toastType}`">
        <span class="toast-icon">
          <svg v-if="toastType === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else-if="toastType === 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <svg v-else-if="toastType === 'warning'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </span>
        {{ toastMsg }}
      </div>
    </Transition>

    <!-- Read receipt details modal -->
    <Teleport to="body">
      <div v-if="readByMsgId" class="modal-overlay" @click.self="readByMsgId = null">
        <div ref="readByModalEl" class="modal read-by-modal" role="dialog" aria-modal="true" aria-label="Read receipts">
          <div class="modal-header">
            <span class="modal-title">Read by</span>
            <button class="btn-icon" aria-label="Close" @click="readByMsgId = null">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="read-by-body">
            <div v-if="readByLoading" class="read-by-empty">Loading…</div>
            <div v-else-if="!readByList.length" class="read-by-empty">No one has read this message yet.</div>
            <div v-for="u in readByList" :key="u.username" class="read-by-item">
              <UserAvatar :username="u.username" :avatarUrl="u.avatar_url" size="sm" />
              <span class="read-by-username">{{ u.username }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Keyboard shortcuts modal -->
    <div v-if="showKeyboardShortcutsModal" class="modal-overlay" @click.self="showKeyboardShortcutsModal = false">
      <div ref="kbdShortcutsModalEl" class="modal kbd-shortcuts-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="modal-header">
          <span class="modal-title">Keyboard Shortcuts</span>
          <button class="btn-icon" aria-label="Close" @click="showKeyboardShortcutsModal = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <table>
          <tr><td><kbd>Ctrl+K</kbd></td><td>Search chats</td></tr>
          <tr><td><kbd>Alt+↑ / ↓</kbd></td><td>Navigate between chats</td></tr>
          <tr><td><kbd>Ctrl+F</kbd></td><td>Search in chat</td></tr>
          <tr><td><kbd>Ctrl+Shift+M</kbd></td><td>Mute / unmute current chat</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Close modals / cancel reply or edit</td></tr>
          <tr><td><kbd>?</kbd></td><td>Show this shortcuts panel</td></tr>
        </table>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="showKeyboardShortcutsModal = false">Close</button>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, nextTick, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useComposer } from '../composables/useComposer.js'
import { useVoiceRecorder } from '../composables/useVoiceRecorder.js'
import { useMessageActions } from '../composables/useMessageActions.js'
import { useChatSse } from '../composables/useChatSse.js'
import { useSwipeReply } from '../composables/useSwipeReply.js'
import ChatSidebar from '../components/ChatSidebar.vue'
import UserAvatar from '../components/UserAvatar.vue'
import AudioPlayer from '../components/AudioPlayer.vue'
import GlobalVoicePlayer from '../components/GlobalVoicePlayer.vue'
import ImageLightbox from '../components/ImageLightbox.vue'
import UserProfileModal from '../components/UserProfileModal.vue'
import EmojiPicker from '../components/EmojiPicker.vue'
import GroupProfileModal from '../components/GroupProfileModal.vue'
import PollMessage from '../components/PollMessage.vue'
import PollForm from '../components/PollForm.vue'
import ScheduledMessagesModal from '../components/ScheduledMessagesModal.vue'
import SchedulePickerModal from '../components/SchedulePickerModal.vue'
import LinkPreview from '../components/LinkPreview.vue'
import MediaGallery from '../components/MediaGallery.vue'
import PollResultsModal from '../components/PollResultsModal.vue'

const route = useRoute()
const router = useRouter()
const chatId = computed(() => route.params.chatId)

// App version injected at build time by Vite (see vite.config.js → define.__APP_VERSION__).
// Source of truth is /VERSION at the project root. devops-agent bumps it per commit.
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

const SENDER_COLORS = ['#5b8dee','#22c55e','#f59e0b','#e879a7','#36c7d6','#9b6cf0','#ff6b6b','#4ade80']
function senderColor(username) {
  if (!username) return SENDER_COLORS[0]
  let h = 0
  for (let i = 0; i < username.length; i++) h = (Math.imul(31, h) + username.charCodeAt(i)) | 0
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length]
}

const chatSidebarRef = ref(null)

const me = ref(null)
const chat = ref(null)
const participants = ref([])

// ── Mute — delegate to sidebar ────────────────────────────────────────────────
function isMuted(id) { return chatSidebarRef.value?.isMuted(id) ?? false }
function toggleMute(id) { chatSidebarRef.value?.toggleMute(id) }

const peerDeliveredId = ref(null)
const peerReadId = ref(null)
const peerReadAt = ref(null)

const messages = ref([])
const nextCursor = ref(null)
const hasMore = ref(false)
const loadingMore = ref(false)
const chatLoading = ref(false)
const showScrollBtn = ref(false)
const unreadWhileScrolled = ref(0)
// ── ChatView-owned shared refs (passed into composables) ──────────
const editingId = ref(null)
const editingText = ref('')
const uploading = ref(false)
const highlightedId = ref(null)
let highlightTimer = null
const newMessageIds = ref(new Set())
const busy = ref(false)

const showCreate = ref(false)
const createIsGroup = ref(false)
const createTitle = ref('')
const createError = ref('')
const creating = ref(false)
const selectedUsers = ref([])
const userSearchQuery = ref('')
const userSuggestions = ref([])
const showSuggestions = ref(false)
let createSearchDebounce = null

const typingUsersMap = reactive({})  // username → true (reactive, current chat)
const typingUserTimers = {}          // username → timeoutId (non-reactive)
const typingUser = computed(() => {
  const names = Object.keys(typingUsersMap)
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
})

const listEl = ref(null)
const composerEl = ref(null)
const fileInputEl = ref(null)
const emojiButtonEl = ref(null)
const attachBtnEl = ref(null)
const sendBtnEl = ref(null)

const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

const profileUsername = ref(null)
const sidebarHidden = ref(window.innerWidth < 640)
const aiMessages = ref([])
const aiLoading = ref(false)

const pinnedMessages = ref([])
const pinnedIndex = ref(0)

const showGroupProfile = ref(false)
const showOnlinePanel = ref(false)
const globalSearchOpen = ref(false)
const showMediaGallery = ref(false)
const onlineUsers = ref([])

const scheduledMessages = ref([])

const searchOpen = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchInputEl = ref(null)
const searchIdx = ref(-1)
let searchDebounce = null

// ─── Modal element refs (for focus trap) ─────────────────────────
const createModalEl = ref(null)
const forwardModalEl = ref(null)
const readByModalEl = ref(null)
const kbdShortcutsModalEl = ref(null)

// ─── Toast notifications ──────────────────────────────────────────
const toastMsg = ref(null)
const toastType = ref('info')
let toastTimer = null

function showToast(text, type = 'info', duration = 2200) {
  clearTimeout(toastTimer)
  toastMsg.value = text
  toastType.value = type
  toastTimer = setTimeout(() => { toastMsg.value = null }, duration)
}

// ─── Notification sound ───────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch (e) { /* AudioContext may be blocked */ }
}

// ─── Keyboard shortcuts modal ─────────────────────────────────────
const showKeyboardShortcutsModal = ref(false)

// ─── Read receipt details — owned by useMessageActions ───────────

// ─── Audio player refs (auto-play next voice message) ─────────────
const audioPlayerRefs = {}

function isVoiceMessage(m) {
  const atts = getAttachments(m)
  if (atts.length && atts[0].type?.startsWith('audio')) return true
  if (m.attachment_url) {
    const u = m.attachment_url.toLowerCase()
    return u.endsWith('.webm') || u.endsWith('.ogg') || u.endsWith('.mp3')
  }
  return false
}

function onAudioEnded(msgId) {
  const msgs = displayMessages.value
  const idx = msgs.findIndex(m => m.id === msgId)
  if (idx === -1) return
  // Find next voice message after this one
  for (let i = idx + 1; i < msgs.length; i++) {
    const m = msgs[i]
    if (!m.deleted_at && isVoiceMessage(m)) {
      const playerRef = audioPlayerRefs[m.id]
      if (playerRef?.play) {
        playerRef.play()
      }
      return
    }
  }
}

// ─── sortReactions helper ─────────────────────────────────────────
// Backend sorts at source but SSE patches and initial loads may arrive
// out of order. Sort descending by count, then alphabetically by emoji
// so the most-popular reaction always appears first.
function sortReactions(arr) {
  if (!arr) return []
  return [...arr].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
}

// ─── renderContent (linkify + markdown-lite) ──────────────────────
// Memoization cache: renderContent is called from the template for every message
// on every re-render. Without caching, each render re-runs DOM escaping + 6 regex
// passes per visible message — wasteful in long chats. Keyed by raw content; the
// output is a pure function of the input, so the cache is always valid. Capped to
// avoid unbounded growth across a long session.
const _renderCache = new Map()
const _RENDER_CACHE_MAX = 1000

function renderContent(text) {
  if (!text) return ''
  const cached = _renderCache.get(text)
  if (cached !== undefined) return cached
  // Sanitize via DOM textContent→innerHTML to get HTML-escaped string
  const div = document.createElement('div')
  div.textContent = text
  let safe = div.innerHTML
  // Linkify URLs
  safe = safe.replace(/https?:\/\/[^\s<>"]+/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
  // Bold: **text**
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic: _text_ (not preceded or followed by word char)
  safe = safe.replace(/(?<![a-zA-Z0-9])_(.+?)_(?![a-zA-Z0-9])/g, '<em>$1</em>')
  // Inline code: `text`
  safe = safe.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  // @mention highlight
  safe = safe.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention-highlight">@$1</span>')
  if (_renderCache.size >= _RENDER_CACHE_MAX) _renderCache.delete(_renderCache.keys().next().value)
  _renderCache.set(text, safe)
  return safe
}

// ─── Unread divider ───────────────────────────────────────────────
const unreadDividerBeforeId = ref(null)
const unreadDividerCount = ref(0)

function computeUnreadDivider() {
  if (!me.value) return
  const unread = messages.value.filter(m =>
    m.sender !== me.value.username &&
    m.deleted_at == null
  )
  const chatData = (chatSidebarRef.value?.sidebarChats || []).find(c => c.id == chatId.value) || chat.value
  const count = chatData?.unread_count || 0
  if (count > 0 && unread.length > 0) {
    const startIdx = unread.length - count
    const firstUnread = unread[Math.max(0, startIdx)]
    unreadDividerBeforeId.value = firstUnread?.id || null
    unreadDividerCount.value = count
  } else {
    unreadDividerBeforeId.value = null
    unreadDividerCount.value = 0
  }
}

// ─── Text highlight helpers ───────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text || '')
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escapeHtml(text).replace(
    new RegExp(escaped, 'gi'),
    m => `<mark>${m}</mark>`
  )
}

// ─── Paste image handler ──────────────────────────────────────────
function onPaste(e) {
  if (isAiChat.value) return
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !active.closest('.composer')) return
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) processFile(file)
      break
    }
  }
}
const reactionPickerMsgId = ref(null)
const reactionPickerPos = ref({ x: 0, y: 0 })

const showFullReactionPicker = ref(false)

// forwardingMsg, showForwardModal, selectionMode, selectedMsgIds, bulkDeleteConfirming,
// enterSelectionMode, exitSelectionMode, toggleMsgSelection, onMsgShiftClick, onMsgClick,
// canDeleteSelected, bulkDelete, bulkForward — all owned by useMessageActions

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👎']

let pingInterval = null
let onlineUsersInterval = null
let _suppressLoadMoreTimer = null
let _suppressLoadMore = false
// True while the view should stay pinned to the newest message. Set when we
// programmatically scroll to bottom (chat enter / send); cleared in onScroll
// once the user scrolls up. While true, async media (images, link-preview
// thumbnails) finishing load re-pins to bottom so late-loading content can't
// push the latest messages out of view ("chat jumps up a second after enter").
let _stickBottom = false

// ─── computed ────────────────────────────────────────────────────
const isAiChat = computed(() => chatId.value === 'ai')
const chatTitle = computed(() => isAiChat.value ? 'AI Assistant' : (chat.value?.display_name || 'Chat'))
const isGroup = computed(() => !!chat.value?.is_group)
const isOwner = computed(() => chat.value?.my_role === 'OWNER')
const displayMessages = computed(() => isAiChat.value ? aiMessages.value : messages.value)

const peerUser = computed(() => {
  if (isGroup.value) return null
  return participants.value.find(p => !p.is_me) || null
})

function isUserOnline(user) {
  if (!user?.last_seen_at) return false
  return (Date.now() - new Date(user.last_seen_at).getTime()) < 65000
}

const isPeerOnline = computed(() => peerUser.value ? isUserOnline(peerUser.value) : false)
const onlineParticipantsCount = computed(() => participants.value.filter(p => isUserOnline(p)).length)
const currentPinned = computed(() => pinnedMessages.value[pinnedIndex.value] || null)

const grouped = computed(() => {
  const groups = []
  for (const m of displayMessages.value) {
    const key = dayKey(m.created_at)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) {
      groups.push({ key, title: formatDateHeader(m.created_at), items: [m] })
    } else {
      last.items.push(m)
    }
  }
  return groups
})

function getAttachments(m) {
  if (m.attachments?.length) return m.attachments
  if (m.attachment_url) return [{ url: m.attachment_url, type: m.attachment_type, name: m.attachment_name }]
  return []
}

const allImages = computed(() => {
  const imgs = []
  for (const m of displayMessages.value) {
    if (m.deleted_at) continue
    for (const a of getAttachments(m)) {
      if (a.type === 'image') imgs.push(a.url)
    }
  }
  return imgs
})

function openLightbox(url) {
  const idx = allImages.value.indexOf(url)
  lightboxIndex.value = idx >= 0 ? idx : 0
  lightboxOpen.value = true
}

// ─── helpers ─────────────────────────────────────────────────────
function openUrl(url) { window.open(url, '_blank') }
function myId() { return me.value?.username || '' }
function isMine(m) { return m.sender === myId() }
function isEditing(m) { return editingId.value === m.id }

function idLE(a, b) {
  if (!a || !b) return false
  return String(a) <= String(b)
}

function dayKey(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return 'unknown'
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatTime(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function formatTimeShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function formatDateHeader(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatRelative(iso) {
  if (!iso) return 'a while ago'
  const date = new Date(iso)
  const now   = new Date()
  const diff  = Math.floor((now - date) / 1000)
  if (diff < 60) return 'just now'
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `today at ${time}`
  if (date.toDateString() === new Date(now - 86400000).toDateString()) return `yesterday at ${time}`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} days ago`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ─── scrolling ────────────────────────────────────────────────────
function isNearBottom(thresholdPx = 100) {
  const el = listEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx
}

async function scrollToBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  _stickBottom = true
  // Prevent onScroll from triggering loadMore() immediately after a programmatic
  // scroll-to-bottom: if messages barely fill the viewport, scrollTop ends up
  // near 0 (which is < 120) and loadMore fires, prepending older messages and
  // jumping the view away from the newest content.
  _suppressLoadMore = true
  clearTimeout(_suppressLoadMoreTimer)
  _suppressLoadMoreTimer = setTimeout(() => { _suppressLoadMore = false }, 600)
}

function scrollToBottomFab() {
  scrollToBottom()
  unreadWhileScrolled.value = 0
}

// Re-pin to bottom when descendant media finishes loading and grows the
// content. Registered in the capture phase on listEl because these events do
// not bubble: <img> fires `load`; <video> never fires `load` and instead
// reports its size via `loadedmetadata`. Only fires while _stickBottom is true
// and we are not prepending older history.
function onMediaLoadPin(e) {
  const tag = e.target && e.target.tagName
  if (tag !== 'IMG' && tag !== 'VIDEO') return
  if (!_stickBottom || loadingMore.value) return
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

// ─── online users ─────────────────────────────────────────────────
async function loadOnlineUsers() {
  try {
    onlineUsers.value = await api.listOnlineUsers()
  } catch {}
}

// ─── data loading ─────────────────────────────────────────────────
async function load() {
  if (isAiChat.value) {
    chat.value = { display_name: 'AI Assistant', is_group: false, my_role: 'MEMBER' }
    participants.value = []
    await scrollToBottom()
    return
  }
  chatLoading.value = true
  try {
    const [chatData, msgData] = await Promise.all([
      api.getChat(chatId.value),
      api.listMessages(chatId.value),
    ])
    chat.value = chatData
    participants.value = chatData.participants || []
    pinnedMessages.value = chatData.pinned_messages || []
    pinnedIndex.value = Math.max(0, (chatData.pinned_messages || []).length - 1)
    messages.value = (msgData.items || []).map(m => ({
      ...m, reactions: sortReactions(m.reactions)
    }))
    nextCursor.value = msgData.next_cursor || null
    hasMore.value = !!msgData.next_cursor
    peerDeliveredId.value = msgData.peer_delivered_message_id || null
    peerReadId.value = msgData.peer_read_message_id || null
  } catch {
    chatLoading.value = false
    if (!chat.value) router.push('/')  // only redirect on truly fresh load failure
    return
  }
  chatLoading.value = false
  computeUnreadDivider()
  const last = messages.value[messages.value.length - 1]
  if (last) await api.markDelivered(chatId.value, last.id).catch(() => {})
  await scrollToBottom()
  loadScheduled()
}

async function loadScheduled() {
  if (isAiChat.value) { scheduledMessages.value = []; return }
  try {
    const data = await api.listScheduledMessages(chatId.value)
    scheduledMessages.value = data.items || []
  } catch { scheduledMessages.value = [] }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value || !nextCursor.value) return
  loadingMore.value = true
  const el = listEl.value
  const prevScrollHeight = el ? el.scrollHeight : 0
  try {
    const data = await api.listMessages(chatId.value, { before: nextCursor.value, limit: 50 })
    const older = data.items || []
    if (older.length) {
      messages.value = [...older, ...messages.value]
      nextCursor.value = data.next_cursor || null
      hasMore.value = !!data.next_cursor
      await nextTick()
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
    }
  } catch {}
  finally { loadingMore.value = false }
}

function onScroll() {
  if (!_suppressLoadMore && listEl.value && listEl.value.scrollTop < 120 && hasMore.value && !loadingMore.value) {
    loadMore()
  }
  updatePinnedIndexFromScroll()
  if (listEl.value) {
    const distFromBottom = listEl.value.scrollHeight - listEl.value.scrollTop - listEl.value.clientHeight
    showScrollBtn.value = distFromBottom > 200
    _stickBottom = distFromBottom <= 200
    if (distFromBottom <= 200) unreadWhileScrolled.value = 0
  }
}

function loadSidebarChats() {
  return chatSidebarRef.value?.loadSidebarChats()
}

function clearCurrentChatUnread() {
  chatSidebarRef.value?.clearCurrentChatUnread(chatId.value)
}

// ─── receipts ─────────────────────────────────────────────────────
async function markReadIfPossible() {
  if (document.visibilityState !== 'visible') return
  const last = messages.value[messages.value.length - 1]
  if (!last) return
  await api.markRead(chatId.value, last.id).catch(() => {})
}

// ─── markDelivered wrapper (passed into useChatSse) ──────────────
const markDelivered = (cid, mid) => api.markDelivered(cid, mid).catch(() => {})

// ─── late-binding holder for cancelEdit ──────────────────────────
// useComposer needs cancelEdit but useMessageActions provides it later.
let _cancelEdit = () => {}

// ─── Composer composable ──────────────────────────────────────────
const {
  input,
  composerError,
  replyingTo,
  pendingFiles,
  dragging,
  mentionOpen,
  mentionQuery,
  mentionIdx,
  mentionCursorStart,
  filteredMentions,
  showEmojiPicker,
  emojiPickerPos,
  showAttachMenu,
  attachMenuPos,
  showSendMenu,
  sendMenuPos,
  showPollForm,
  showScheduledList,
  showSchedulePicker,
  composerLinkPreview,
  composerLinkPreviewDismissed,
  composerLinkPreviewLoading,
  send: _composerSend,
  onTyping,
  onKeydown: _composerOnKeydown,
  selectMention,
  closeMentionPopup,
  onEmojiSelect: _composerOnEmojiSelect,
  toggleEmojiPicker: _composerToggleEmojiPicker,
  toggleAttachMenu,
  openSendMenu,
  onSendTouchStart,
  onSendTouchEnd,
  openSchedulePicker,
  onSchedulePicked,
  onScheduledUpdated,
  onScheduledDeleted,
  onFileSelect,
  cancelFile,
  processFile,
  onDragEnter,
  onDragLeave,
  onDrop,
  startReply,
  cancelReply,
  submitPoll,
  saveDraft,
  loadDraft,
  linkPreviewDebounce,
  dragCounterReset,
} = useComposer({
  chatId,
  me,
  isAiChat,
  isGroup,
  messages,
  participants,
  editingId,
  editingText,
  cancelEdit: () => _cancelEdit(),
  composerEl,
  fileInputEl,
  emojiButtonEl,
  attachBtnEl,
  sendBtnEl,
  listEl,
  isNearBottom,
  scrollToBottom,
  showToast,
  aiMessages,
  aiLoading,
  scheduledMessages,
  loadScheduled,
  uploading,
})

// ─── Voice recorder (composable) ──────────────────────────────────
const { recording, recordingTime, waveformBars, startRecording, cancelRecording, sendRecording, fmtRecTime } = useVoiceRecorder({ isAiChat, chatId, isNearBottom, scrollToBottom, showToast, uploading, composerError })

// ─── Message actions (composable) — MUST be before useChatSse ────
const {
  deletingMsgId,
  readByMsgId,
  readByList,
  readByLoading,
  forwardingMsg,
  showForwardModal,
  selectionMode,
  selectedMsgIds,
  bulkDeleteConfirming,
  canDeleteSelected,
  pollResultsMsg,
  canPin,
  removeMessage,
  startEdit,
  saveEdit,
  cancelEdit,
  openReadBy,
  doPin,
  doToggleReaction,
  handleReactionClick,
  isMyReaction,
  doVotePoll,
  doRetractPollVote,
  openPollResults,
  startForward,
  doForward: _doForward,
  enterSelectionMode,
  exitSelectionMode,
  toggleMsgSelection,
  onMsgShiftClick,
  onMsgClick,
  bulkDelete,
  bulkForward,
  copyMessageText: _copyMessageText,
  pinnedPreview,
  stablePinnedIndex,
  lockPinnedNav,
  clickPinnedBar: _clickPinnedBar,
  navigatePin: _navigatePin,
  updatePinnedIndexFromScroll: _updatePinnedIndexFromScroll,
} = useMessageActions({
  chatId,
  messages,
  me,
  pinnedMessages,
  pinnedIndex,
  currentPinned,
  editingId,
  composerEl,
  input,
  editingText,
  showToast,
  isGroup,
  isOwner,
  isAiChat,
  composerError,
})
// Late-bind cancelEdit so useComposer's closure picks it up
_cancelEdit = cancelEdit

// Wrappers that supply ChatView-owned locals to composable functions
function clickPinnedBar() { return _clickPinnedBar(jumpToMessage) }
function navigatePin(delta) { return _navigatePin(delta, jumpToMessage) }
function updatePinnedIndexFromScroll() { return _updatePinnedIndexFromScroll(listEl) }
function doForward(targetChatId) { return _doForward(targetChatId, router) }
function copyMessageText(m, closeMobileMenu) { return _copyMessageText(m, closeMobileMenu) }

// ─── SSE (composable) ─────────────────────────────────────────────
const { sseStatus, connectSse, stopChatSse } = useChatSse({
  chatId,
  me,
  messages,
  chatSidebarRef,
  participants,
  chat,
  pinnedMessages,
  pinnedIndex,
  peerDeliveredId,
  peerReadId,
  newMessageIds,
  showScrollBtn,
  unreadWhileScrolled,
  typingUsersMap,
  typingUserTimers,
  peerReadAt,
  currentPinned,
  scheduledMessages,
  isNearBottom,
  scrollToBottom,
  markReadIfPossible,
  markDelivered,
  loadScheduled,
  isMuted,
  playNotifSound,
  sortReactions,
  stablePinnedIndex,
  router,
})

// ─── Swipe-to-reply & long-press / desktop context menu (composable) ─
const {
  swipeMsgId,
  msgSwipeX,
  msgSwipeDone,
  mobileMenu,
  mobileMenuEl,
  desktopMenu,
  desktopMenuEl,
  desktopMenuStyle,
  onMsgTouchStart,
  onMsgTouchEnd,
  onMsgTouchCancel,
  openDesktopMenu,
  closeDesktopMenu,
  closeMobileMenu,
} = useSwipeReply({ listEl, isAiChat, startReply, messages, me })

// ─── emoji / reactions ────────────────────────────────────────────
// Wrappers for composable functions that need ChatView-owned state injected

// toggleEmojiPicker also closes the reaction picker before opening emoji
function toggleEmojiPicker() {
  closeReactionPicker()
  _composerToggleEmojiPicker()
}

// onEmojiSelect routes to reaction toggling when reaction picker is open
function onEmojiSelect(emoji) {
  _composerOnEmojiSelect(emoji, { reactionPickerMsgId, showFullReactionPicker, doToggleReaction, closeReactionPicker })
}

// send — wrap to supply saveEdit (avoids passing MouseEvent as saveEdit param)
function send() { return _composerSend(() => saveEdit()) }

// onKeydown — wrap to supply ChatView-owned locals
function onKeydown(e) {
  return _composerOnKeydown(e, {
    send,
    bulkDeleteConfirming,
    exitSelectionMode,
    selectionMode,
    closeDesktopMenu,
    desktopMenu,
    cancelReply,
  })
}

function openReactionPicker(msgId, event) {
  if (reactionPickerMsgId.value === msgId) {
    closeReactionPicker()
    return
  }
  // event.currentTarget is nulled after dispatch (e.g. when event is stored as anchorEvent).
  // Fall back to clientX/Y which remain valid on the event object.
  let srcX, srcY
  if (event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect()
    srcX = rect.left
    srcY = rect.top
  } else {
    srcX = event.clientX
    srcY = event.clientY
  }
  const halfW = 144
  const clampedX = Math.max(halfW + 8, Math.min(srcX, window.innerWidth - halfW - 8))
  reactionPickerPos.value = { x: clampedX, y: srcY }
  reactionPickerMsgId.value = msgId
  showFullReactionPicker.value = false
}

function closeReactionPicker() {
  reactionPickerMsgId.value = null
  showFullReactionPicker.value = false
}

// doToggleReaction, handleReactionClick, isMyReaction — owned by useMessageActions

// ─── search ───────────────────────────────────────────────────────
function toggleSearch() {
  if (searchOpen.value) {
    closeSearch()
  } else {
    searchOpen.value = true
    nextTick(() => searchInputEl.value?.focus())
  }
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  searchResults.value = []
  searchLoading.value = false
  searchIdx.value = -1
  clearTimeout(createSearchDebounce)
}

function onSearchInput() {
  clearTimeout(createSearchDebounce)
  const q = searchQuery.value.trim()
  if (q.length < 2) {
    searchResults.value = []
    searchLoading.value = false
    return
  }
  searchLoading.value = true
  searchDebounce = setTimeout(() => doSearch(q), 300)
}

async function doSearch(q) {
  try {
    const data = await api.searchMessages(chatId.value, q)
    if (searchQuery.value.trim() !== q) return
    searchResults.value = data.items || []
  } catch {
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

watch(searchResults, () => { searchIdx.value = -1 })

async function jumpToSearchResult(id) {
  closeSearch()
  await jumpToMessage(id)
}

function navigateSearchResult(dir) {
  const n = searchResults.value.length
  if (!n) return
  searchIdx.value = (searchIdx.value + dir + n) % n
  jumpToMessage(searchResults.value[searchIdx.value].id)
}

// doVotePoll, doRetractPollVote — owned by useMessageActions
// submitPoll, send, processFile, onFileSelect, cancelFile, onDragEnter, onDragLeave,
// onDrop, onKeydown — all owned by useComposer (wrappers/exports above)

function openGroupProfile() {
  if (!isGroup.value) return
  showGroupProfile.value = true
}

function onGroupUpdated(patch) {
  chat.value = { ...chat.value, ...patch }
  chatSidebarRef.value?.updateSidebarChat(chatId.value, patch)
}

function onGroupMembersChanged(newParticipants) {
  participants.value = newParticipants
}

function openUserProfile(username) {
  if (!username || username === me.value?.username) return
  profileUsername.value = username
}

function onMessageContentClick(e) {
  if (e.target.classList.contains('mention-highlight')) {
    const username = e.target.textContent.replace(/^@/, '')
    openUserProfile(username)
  }
}

function onGlobalSearchSelect({ chatId: targetChatId, messageId }) {
  globalSearchOpen.value = false
  if (targetChatId === chatId.value) {
    jumpToMessage(messageId)
    if (route.query.highlight) {
      router.replace({ query: { ...route.query, highlight: undefined } })
    }
    return
  }
  router.push({ path: `/chats/${targetChatId}`, query: { highlight: messageId } })
}

function replyPreview(msg) {
  if (!msg || msg.deleted) return ''
  if (msg.type === 'poll') return 'Poll'
  const atts = msg.attachments?.length ? msg.attachments
    : msg.attachment_type ? [{ type: msg.attachment_type, name: msg.attachment_name }]
    : null
  if (atts?.length) {
    const images = atts.filter(a => a.type === 'image')
    const videos = atts.filter(a => a.type === 'video')
    const audios = atts.filter(a => a.type === 'audio')
    const files = atts.filter(a => !['image', 'video', 'audio'].includes(a.type))
    if (images.length > 1) return `${images.length} photos`
    if (images.length === 1) return 'Photo'
    if (videos.length) return 'Video'
    if (audios.length) return 'Voice message'
    if (files.length) return files[0].name ? `File: ${files[0].name}` : 'File'
  }
  return msg.content || 'Message'
}

// startReply — owned by useComposer

async function jumpToMessage(id) {
  // Load older pages until the message appears in the DOM
  let attempts = 0
  while (!document.getElementById(`msg-${id}`) && hasMore.value && attempts < 8) {
    await loadMore()
    attempts++
  }
  await nextTick()
  const el = document.getElementById(`msg-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Cancel pending clear and force-restart animation even for repeated jumps to same message
  if (highlightTimer !== null) { clearTimeout(highlightTimer); highlightTimer = null }
  if (highlightedId.value === id) {
    highlightedId.value = null
    await nextTick()
  }
  highlightedId.value = id
  highlightTimer = setTimeout(() => { highlightedId.value = null; highlightTimer = null }, 1800)
}

async function maybeJumpFromQuery() {
  const id = route.query.highlight
  if (!id || isAiChat.value) return
  await jumpToMessage(id)
  const { highlight, ...rest } = route.query
  router.replace({ query: rest })
}

// cancelReply — owned by useComposer

// startForward, doForward (local wrapper above), startEdit, cancelEdit, saveEdit,
// deletingMsgId, removeMessage, openReadBy, doPin, pinnedPreview, lockPinnedNav,
// stablePinnedIndex, clickPinnedBar (local wrapper above), navigatePin (local wrapper above),
// updatePinnedIndexFromScroll (local wrapper above) — all owned by useMessageActions

async function logout() {
  await api.logout()
  router.push('/login')
}

function openCreate() {
  selectedUsers.value = []
  userSearchQuery.value = ''
  userSuggestions.value = []
  showSuggestions.value = false
  createTitle.value = ''
  createError.value = ''
  createIsGroup.value = false
  clearTimeout(createSearchDebounce)
  showCreate.value = true
}

function closeCreate() {
  showCreate.value = false
  selectedUsers.value = []
  userSearchQuery.value = ''
  userSuggestions.value = []
  showSuggestions.value = false
  clearTimeout(createSearchDebounce)
}

function onUserSearchInput() {
  clearTimeout(createSearchDebounce)
  const q = userSearchQuery.value.trim()
  if (!q) {
    userSuggestions.value = []
    showSuggestions.value = false
    return
  }
  createSearchDebounce = setTimeout(async () => {
    const results = await api.searchUsers(q)
    const selectedNames = new Set(selectedUsers.value.map(u => u.username))
    userSuggestions.value = results.filter(u => !selectedNames.has(u.username))
    showSuggestions.value = userSuggestions.value.length > 0
  }, 300)
}

function onSearchBlur() {
  setTimeout(() => { showSuggestions.value = false }, 150)
}

async function selectUser(user) {
  if (createIsGroup.value) {
    selectedUsers.value.push(user)
    userSearchQuery.value = ''
    userSuggestions.value = []
    showSuggestions.value = false
  } else {
    selectedUsers.value = [user]
    userSearchQuery.value = ''
    userSuggestions.value = []
    showSuggestions.value = false
    await createChat()
  }
}

function removeUser(username) {
  selectedUsers.value = selectedUsers.value.filter(u => u.username !== username)
}

async function createChat() {
  createError.value = ''
  creating.value = true
  const isGroup = createIsGroup.value
  try {
    const typedIdentifier = userSearchQuery.value.trim()
    const participants = selectedUsers.value.length > 0
      ? selectedUsers.value.map(u => u.username)
      : typedIdentifier ? [typedIdentifier] : []
    const newChat = await api.createChat({
      isGroup,
      title: createTitle.value.trim(),
      participants,
    })
    closeCreate()
    // Optimistic insert — появляется мгновенно без перезагрузки
    chatSidebarRef.value?.addSidebarChat({
      id: newChat.id,
      is_group: newChat.is_group,
      title: newChat.title,
      display_name: newChat.title || newChat.peer_username || (isGroup ? 'Group chat' : 'New chat'),
      last_message: null,
      unread_count: 0,
      created_at: new Date().toISOString(),
    })
    router.push(`/chats/${newChat.id}`)
  } catch (e) { createError.value = e.message }
  finally { creating.value = false }
}

watch(showOnlinePanel, (val) => { if (val) loadOnlineUsers() })

// useComposer owns the draft→localStorage watcher. ChatView adds a separate
// watcher solely to keep the sidebar draft preview in sync via updateDraft().
watch(input, (val) => {
  if (!editingId.value && !isAiChat.value) chatSidebarRef.value?.updateDraft(chatId.value, val)
})

// ─── Focus traps for modals ───────────────────────────────────────
useFocusTrap(createModalEl, showCreate)
useFocusTrap(forwardModalEl, showForwardModal)
// readByMsgId is not a boolean — derive one
const readByOpen = computed(() => !!readByMsgId.value)
useFocusTrap(readByModalEl, readByOpen)
useFocusTrap(kbdShortcutsModalEl, showKeyboardShortcutsModal)

// ─── watcher: reloads chat data when chatId changes (same component reuse) ───
watch(chatId, async (newId, oldId) => {
  if (!newId || newId === oldId) return
  if (window.innerWidth < 640) sidebarHidden.value = true
  stopChatSse()
  Object.values(typingUserTimers).forEach(clearTimeout)
  Object.keys(typingUsersMap).forEach(k => delete typingUsersMap[k])
  messages.value = []
  nextCursor.value = null
  hasMore.value = false
  loadingMore.value = false
  chatLoading.value = false
  showScrollBtn.value = false
  unreadWhileScrolled.value = 0
  chat.value = null
  participants.value = []
  pinnedMessages.value = []
  pinnedIndex.value = 0
  peerDeliveredId.value = null
  peerReadId.value = null
  peerReadAt.value = null
  unreadDividerBeforeId.value = null
  unreadDividerCount.value = 0
  editingId.value = null
  editingText.value = ''
  cancelEdit()
  cancelReply()
  cancelFile()
  cancelRecording()
  clearTimeout(linkPreviewDebounce.value)
  composerLinkPreview.value = null
  composerLinkPreviewDismissed.value = false
  composerLinkPreviewLoading.value = false
  dragCounterReset()
  dragging.value = false
  lightboxOpen.value = false
  composerError.value = ''
  deletingMsgId.value = null
  showEmojiPicker.value = false
  closeMentionPopup()
  closeReactionPicker()
  showGroupProfile.value = false
  scheduledMessages.value = []
  showScheduledList.value = false
  showSchedulePicker.value = false
  showSendMenu.value = false
  closeSearch()
  globalSearchOpen.value = false
  showMediaGallery.value = false
  showForwardModal.value = false
  forwardingMsg.value = null
  exitSelectionMode()
  readByMsgId.value = null
  closeMobileMenu()
  onMsgTouchCancel()
  await load()
  await connectSse()
  if (!isAiChat.value) {
    clearCurrentChatUnread()
    await markReadIfPossible()
  }
  await maybeJumpFromQuery()
}, { immediate: false })

// copyMessageText — local wrapper above (delegates to useMessageActions)

// ─── Mobile swipe gesture to open / close sidebar ────────────────
// Strategy: use a non-passive touchmove listener (registered imperatively
// below) to call preventDefault() the moment a horizontal swipe is confirmed.
// This stops iOS from firing touchcancel (which it does when a scrollable
// container intercepts the touch) and guarantees touchend fires.
const SWIPE_THRESHOLD = 50  // px to commit to sidebar toggle

let swipeStartX  = 0
let swipeStartY  = 0
let swipeDecided = null  // null | 'h' | 'v' — direction locked after 5 px
let swipeInScrollZone = false  // true when touch started inside a real scroll container

// Walk up the DOM to check if el is inside a vertically scrollable container.
// Called once per touch sequence (at touchstart) so getComputedStyle cost is fine.
function _isInScrollZone(el) {
  while (el && el !== document.documentElement) {
    const oy = window.getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return true
    el = el.parentElement
  }
  return false
}

function onSwipeTouchStart(e) {
  const touch = e.touches[0]
  swipeStartX  = touch.clientX
  swipeStartY  = touch.clientY
  swipeDecided = null
  swipeInScrollZone = _isInScrollZone(e.target)
  // No left-edge guard needed: _msgAreaTouchMove calls e.stopPropagation()
  // on confirmed message swipe-to-reply, so those touches never reach
  // _swipeTouchMove and cannot accidentally open the sidebar.
}

// Must be registered with { passive: false } so preventDefault() is allowed.
// Horizontal moves always get preventDefault so the browser never native-scrolls
// the page left/right (there is no horizontal scroll target — only our JS sidebar).
// Vertical moves get preventDefault outside scroll zones to stop iOS page bounce.
function _swipeTouchMove(e) {
  if (window.innerWidth > 640) return
  if (swipeDecided !== null) {
    if (swipeDecided === 'h') e.preventDefault()
    else if (!swipeInScrollZone) e.preventDefault()
    return
  }
  const dx = Math.abs(e.touches[0].clientX - swipeStartX)
  const dy = Math.abs(e.touches[0].clientY - swipeStartY)
  // Before direction is locked: if there is any horizontal component that clearly
  // dominates the vertical, prevent immediately so iOS can't start a native scroll.
  if (dx < 5 && dy < 5) {
    if (dx > 0 && dx >= dy) e.preventDefault()
    return
  }
  swipeDecided = dx > dy ? 'h' : 'v'
  if (swipeDecided === 'h') e.preventDefault()
  else if (!swipeInScrollZone) e.preventDefault()
}

function onSwipeTouchEnd(e) {
  const wasH = swipeDecided === 'h'
  swipeDecided = null
  if (window.innerWidth > 640 || !wasH) return
  const dx = e.changedTouches[0].clientX - swipeStartX
  if (sidebarHidden.value) {
    if (dx > SWIPE_THRESHOLD) sidebarHidden.value = false
  } else {
    if (dx < -SWIPE_THRESHOLD) sidebarHidden.value = true
  }
}

function onSwipeTouchCancel() { swipeDecided = null }

// ─── Keyboard shortcuts ───────────────────────────────────────────
function navigateChat(direction) {
  const chats = chatSidebarRef.value?.filteredSidebarChats || []
  if (!chats.length) return
  const idx = chats.findIndex(c => c.id === chatId.value)
  const next = chats[idx + direction]
  if (next) router.push(`/chats/${next.id}`)
}

function onGlobalKeydown(e) {
  // Don't trigger when user is typing in any input/textarea outside composer
  const active = document.activeElement
  const isExternalInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !active.closest('.composer') && !active.closest('.composer-wrap')

  // Ctrl+K / Cmd+K — focus sidebar search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    chatSidebarRef.value?.focusSidebarSearch()
    return
  }
  // ? — show keyboard shortcuts (only when no input is focused)
  if (e.key === '?' && !isExternalInput && !active?.closest('.composer')) {
    showKeyboardShortcutsModal.value = true
    return
  }
  if (isExternalInput) return
  // Alt+↑ — previous chat
  if (e.altKey && e.key === 'ArrowUp') {
    e.preventDefault()
    navigateChat(-1)
    return
  }
  // Alt+↓ — next chat
  if (e.altKey && e.key === 'ArrowDown') {
    e.preventDefault()
    navigateChat(1)
    return
  }
  // Ctrl+F — toggle in-chat search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isAiChat.value) {
    e.preventDefault()
    toggleSearch()
    return
  }
  // Ctrl+Shift+M — mute/unmute current chat
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
    e.preventDefault()
    if (chatId.value && !isAiChat.value) toggleMute(chatId.value)
    return
  }
  // Escape — close modals
  if (e.key === 'Escape') {
    if (readByMsgId.value) { readByMsgId.value = null; return }
    if (bulkDeleteConfirming.value) { bulkDeleteConfirming.value = false; return }
    if (selectionMode.value) { exitSelectionMode(); return }
    chatSidebarRef.value?.closeSidebarMenu()
    if (showKeyboardShortcutsModal.value) { showKeyboardShortcutsModal.value = false; return }
  }
}

// ─── lifecycle ────────────────────────────────────────────────────
function onWindowResize() {
  if (window.innerWidth < 640 && !sidebarHidden.value) sidebarHidden.value = true
}

// Tracks the visible viewport height (shrinks when iOS keyboard opens).
// Sets --vvh on :root; .app-shell uses height:var(--vvh) so the shell
// shrinks with the keyboard, keeping the composer above it.
// Two-frame approach: first rAF sets --vvh, second rAF scrolls the
// messages list to the bottom (after layout recalculates with new height)
// so the last message stays visible above the composer.
// NOTE: _onComposerFocusIn is now owned and registered by useComposer.
let _vvhRafId = null

function updateVVH() {
  // Capture scroll state now, before the rAF changes clientHeight.
  const wasAtBottom = isNearBottom(200)
  if (_vvhRafId) cancelAnimationFrame(_vvhRafId)
  _vvhRafId = requestAnimationFrame(() => {
    _vvhRafId = null
    const vv = window.visualViewport
    const h = vv ? vv.height : window.innerHeight
    document.documentElement.style.setProperty('--vvh', `${h}px`)
    if ((window.scrollY !== 0 || window.scrollX !== 0) && window.scrollTo) {
      window.scrollTo(0, 0)
    }
    // After --vvh is set the layout reflows; a second rAF runs after that
    // reflow so scrollHeight reflects the new (shorter) messages-area height.
    if (wasAtBottom) {
      requestAnimationFrame(() => {
        if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
      })
    }
  })
}

onMounted(async () => {
  // Capture phase: <img> load / <video> loadedmetadata do not bubble.
  listEl.value?.addEventListener('load', onMediaLoadPin, true)
  listEl.value?.addEventListener('loadedmetadata', onMediaLoadPin, true)
  ;[me.value] = await Promise.all([api.me()])
  await Promise.all([load(), loadSidebarChats()])
  const map = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('draft:')) {
      const val = localStorage.getItem(key)
      if (val) map[key.slice(6)] = val
    }
  }
  chatSidebarRef.value?.setDraftMap(map)
  input.value = loadDraft(chatId.value)
  await connectSse()
  if (!isAiChat.value) {
    clearCurrentChatUnread()
    await markReadIfPossible()
  }
  await maybeJumpFromQuery()
  // Disable browser pinch-zoom while in chat: ImageLightbox uses JS zoom instead.
  // Scoped to ChatView so /login, /register, /profile retain normal zoom.
  const _metaVP = document.querySelector('meta[name="viewport"]')
  if (_metaVP) _metaVP.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
  document.addEventListener('visibilitychange', markReadIfPossible)
  document.addEventListener('paste', onPaste)
  document.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('resize', onWindowResize)
  window.visualViewport?.addEventListener('resize', updateVVH)
  window.visualViewport?.addEventListener('scroll', updateVVH)
  document.addEventListener('touchmove', _swipeTouchMove, { passive: false })
  // _onComposerFocusIn is registered by useComposer's onMounted — no duplicate needed here.
  // _msgAreaTouchMove is registered by useSwipeReply's watchEffect — no duplicate needed here.
  updateVVH()
  api.ping().catch(() => {})
  loadOnlineUsers()
  pingInterval = setInterval(() => api.ping().catch(() => {}), 30000)
  onlineUsersInterval = setInterval(loadOnlineUsers, 15000)
})

onBeforeUnmount(() => {
  stopChatSse()
  if (pingInterval) clearInterval(pingInterval)
  if (onlineUsersInterval) clearInterval(onlineUsersInterval)
  Object.values(typingUserTimers).forEach(clearTimeout)
  // typingDebounce and linkPreviewDebounce are cleared by useComposer's onBeforeUnmount.
  const _sidebarTypingTimers = chatSidebarRef.value?.sidebarTypingTimers
  if (_sidebarTypingTimers) Object.values(_sidebarTypingTimers).forEach(clearTimeout)
  listEl.value?.removeEventListener('load', onMediaLoadPin, true)
  listEl.value?.removeEventListener('loadedmetadata', onMediaLoadPin, true)
  document.removeEventListener('visibilitychange', markReadIfPossible)
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('resize', onWindowResize)
  window.visualViewport?.removeEventListener('resize', updateVVH)
  window.visualViewport?.removeEventListener('scroll', updateVVH)
  document.removeEventListener('touchmove', _swipeTouchMove)
  // _onComposerFocusIn is removed by useComposer's onBeforeUnmount — no duplicate needed here.
  // _msgAreaTouchMove and _msgLongPressTimer are cleaned up by useSwipeReply's onBeforeUnmount.
  if (_vvhRafId) cancelAnimationFrame(_vvhRafId)
  // Restore default viewport so other routes can zoom normally.
  const _metaVP = document.querySelector('meta[name="viewport"]')
  if (_metaVP) _metaVP.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover'
  document.title = 'RealtimeChat'
})
</script>

<style scoped>
.user-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 10px;
  background: var(--accent);
  color: #fff;
  border-radius: 12px;
  font-size: 13px;
}
.user-chip-remove {
  background: none;
  border: none;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
}
.user-chip-remove:hover { color: #fff; }
.user-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 50;
  overflow: hidden;
  max-height: 220px;
  overflow-y: auto;
}
.user-suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text);
  font-size: 14px;
  transition: background 0.12s;
}
.user-suggestion-item:hover { background: var(--surface-3); }
.user-suggestion-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.user-suggestion-name { font-weight: 500; }

.muted-icon {
  color: var(--text-3);
  flex-shrink: 0;
  display: block;
}

.bulk-delete-confirm-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--danger);
  white-space: nowrap;
}

/* ─── Chat load failure state ─────────────────────────────────── */
.chat-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
  gap: 4px;
}
.chat-load-error-text {
  font-size: 14px;
  color: var(--text-3);
  text-align: center;
}
</style>
