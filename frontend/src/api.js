async function request(path, options = {}) {
    const access = localStorage.getItem('access_token')
    const headers = { ...(options.headers || {}) }

    if (!headers['Content-Type'] && options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
    }
    if (access) headers['Authorization'] = `Bearer ${access}`

    const res = await fetch(path, { ...options, headers })

    if (res.status === 401) {
        const refreshed = await tryRefresh()
        if (refreshed) {
            const access2 = localStorage.getItem('access_token')
            const headers2 = { ...headers, Authorization: `Bearer ${access2}` }
            const res2 = await fetch(path, { ...options, headers: headers2 })
            if (res2.status === 401) {
                localStorage.removeItem('access_token')
                localStorage.removeItem('refresh_token')
                window.location.href = '/login'
            }
            return res2
        }
    }

    return res
}

// In-flight refresh guard. Refresh tokens rotate on every /auth/refresh, so two
// concurrent 401s racing to refresh would each consume the token and invalidate
// the other — causing a spurious logout. We collapse all concurrent callers onto
// a single shared refresh promise so the token is rotated exactly once.
let refreshPromise = null

function tryRefresh() {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
        const refresh = localStorage.getItem('refresh_token')
        if (!refresh) return false

        let res
        try {
            res = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refresh }),
            })
        } catch {
            // Network error — keep tokens, let the caller retry later.
            return false
        }

        if (!res.ok) {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            return false
        }

        const json = await res.json()
        localStorage.setItem('access_token', json.access_token)
        if (json.refresh_token) localStorage.setItem('refresh_token', json.refresh_token)
        return true
    })()

    refreshPromise.finally(() => { refreshPromise = null })
    return refreshPromise
}

export const api = {
    login: async (identifier, password) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Login failed')
        localStorage.setItem('access_token', json.access_token)
        localStorage.setItem('refresh_token', json.refresh_token)
    },

    logout: async () => {
        const refresh = localStorage.getItem('refresh_token')
        if (refresh) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refresh }),
            }).catch(() => {})
        }
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
    },

    me: async () => {
        const res = await request('/api/me')
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load profile')
        return json
    },

    updateProfile: async ({ username, avatarUrl }) => {
        const body = {}
        if (username !== undefined) body.username = username
        if (avatarUrl !== undefined) body.avatar_url = avatarUrl
        const res = await request('/api/me', {
            method: 'PATCH',
            body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to update profile')
        return json
    },

    ping: async () => {
        await request('/api/me/ping', { method: 'POST' })
    },

    listChats: async () => {
        const res = await request('/api/chats')
        const text = await res.text()
        try {
            const json = JSON.parse(text)
            if (!res.ok) throw new Error(json.error || json.message || 'Failed to load chats')
            return json
        } catch {
            throw new Error(text.slice(0, 120) || 'Failed to load chats')
        }
    },

    getChat: async (chatId) => {
        const res = await request(`/api/chats/${chatId}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || json.message || 'Failed to load chat')
        return json
    },

    createChat: async ({ isGroup, title, description, participants }) => {
        const res = await request('/api/chats', {
            method: 'POST',
            body: JSON.stringify({
                is_group: !!isGroup,
                title: isGroup ? title : null,
                description: description || null,
                participants: participants || [],
            }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to create chat')
        return json
    },

    renameChat: async (chatId, title) => {
        const res = await request(`/api/chats/${chatId}`, {
            method: 'PATCH',
            body: JSON.stringify({ title }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to rename chat')
        return json
    },

    updateChatAvatar: async (chatId, avatarUrl) => {
        const res = await request(`/api/chats/${chatId}`, {
            method: 'PATCH',
            body: JSON.stringify({ avatar_url: avatarUrl }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to update chat avatar')
        return json
    },

    getUser: async (username) => {
        const res = await request(`/api/users/${username}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'User not found')
        return json
    },

    searchUsers: async (q) => {
        const res = await request(`/api/users/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) return []
        return res.json()
    },

    deleteChat: async (chatId) => {
        const res = await request(`/api/chats/${chatId}`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to delete chat')
        return json
    },

    leaveChat: async (chatId) => {
        const res = await request(`/api/chats/${chatId}/leave`, { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to leave chat')
        return json
    },

    addChatMember: async (chatId, identifier) => {
        const res = await request(`/api/chats/${chatId}/members`, {
            method: 'POST',
            body: JSON.stringify({ identifier }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to add member')
        return json
    },

    removeChatMember: async (chatId, userId) => {
        const res = await request(`/api/chats/${chatId}/members/${userId}`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to remove member')
        return json
    },

    listMessages: async (chatId, params = {}) => {
        const qs = new URLSearchParams(params).toString()
        const res = await request(`/api/chats/${chatId}/messages${qs ? '?' + qs : ''}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load messages')
        return json
    },

    aiChat: async (messages) => {
        const res = await request('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ messages }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'AI request failed')
        return json
    },

    uploadFile: (file, onProgress) => {
        const attemptUpload = (token) => new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            const fd = new FormData()
            fd.append('file', file)
            xhr.upload.onprogress = e => {
                if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100))
            }
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve({ ok: true, data: JSON.parse(xhr.responseText) }) }
                    catch { reject(new Error('Invalid server response')) }
                } else {
                    resolve({ ok: false, status: xhr.status, body: xhr.responseText })
                }
            }
            xhr.onerror = () => reject(new Error('Network error'))
            xhr.open('POST', '/api/upload')
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            xhr.send(fd)
        })

        return (async () => {
            const res = await attemptUpload(localStorage.getItem('access_token'))
            if (res.ok) return res.data
            if (res.status === 401) {
                const refreshed = await tryRefresh()
                if (refreshed) {
                    const res2 = await attemptUpload(localStorage.getItem('access_token'))
                    if (res2.ok) return res2.data
                    let msg = 'Upload failed'
                    try { msg = JSON.parse(res2.body).error || msg } catch {}
                    throw new Error(msg)
                }
            }
            let msg = 'Upload failed'
            try { msg = JSON.parse(res.body).error || msg } catch {}
            throw new Error(msg)
        })()
    },

    sendMessage: async (chatId, content, replyToId = null, attachments = []) => {
        const body = { content }
        if (replyToId) body.reply_to_id = replyToId
        if (attachments.length) body.attachments = attachments.map(a => ({ url: a.url, type: a.type, name: a.name }))
        const res = await request(`/api/chats/${chatId}/messages`, {
            method: 'POST',
            body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to send message')
        return json
    },

    sendForwardedMessage: async (chatId, originalMessageId) => {
        const res = await request(`/api/chats/${chatId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ forwarded_from_id: originalMessageId }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to forward message')
        return json
    },

    editMessage: async (chatId, messageId, content) => {
        const res = await request(`/api/chats/${chatId}/messages/${messageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to edit message')
        return json
    },

    deleteMessage: async (chatId, messageId) => {
        const res = await request(`/api/chats/${chatId}/messages/${messageId}`, {
            method: 'DELETE',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to delete message')
        return json
    },

    sendTyping: async (chatId) => {
        await request(`/api/chats/${chatId}/typing`, { method: 'POST' })
    },

    getMercureCookie: async (chatId) => {
        const res = await request(`/api/chats/${chatId}/mercure-subscribe`, { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to subscribe')
        return json
    },

    subscribeAllChats: async () => {
        const res = await request('/api/chats/mercure-subscribe', { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to subscribe')
        return json
    },

    markDelivered: async (chatId, msgId) => {
        await request(`/api/chats/${chatId}/delivered`, {
            method: 'POST',
            body: JSON.stringify({ last_delivered_message_id: msgId }),
        })
    },

    markRead: async (chatId, msgId) => {
        await request(`/api/chats/${chatId}/read`, {
            method: 'POST',
            body: JSON.stringify({ last_read_message_id: msgId }),
        })
    },

    getUserAvatarHistory: async () => {
        const res = await request('/api/me/avatars')
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load avatar history')
        return json
    },

    getChatAvatarHistory: async (chatId) => {
        const res = await request(`/api/chats/${chatId}/avatars`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load avatar history')
        return json
    },

    deleteUserAvatarHistory: async (id) => {
        const res = await request(`/api/me/avatars/${id}`, { method: 'DELETE' })
        if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            throw new Error(json.error || 'Failed to delete')
        }
    },

    deleteChatAvatarHistory: async (chatId, id) => {
        const res = await request(`/api/chats/${chatId}/avatars/${id}`, { method: 'DELETE' })
        if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            throw new Error(json.error || 'Failed to delete')
        }
    },

    listOnlineUsers: async () => {
        const res = await request('/api/users/online')
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load online users')
        return json
    },

    pinMessage: async (chatId, messageId) => {
        const res = await request(`/api/chats/${chatId}/pin`, {
            method: 'POST',
            body: JSON.stringify({ message_id: messageId ?? null }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to pin message')
        return json
    },

    searchMessages: async (chatId, q) => {
        const res = await request(`/api/chats/${chatId}/messages/search?q=${encodeURIComponent(q)}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Search failed')
        return json
    },

    searchAllMessages: async (q) => {
        const res = await request(`/api/messages/search?q=${encodeURIComponent(q)}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Search failed')
        return json
    },

    toggleReaction: async (chatId, messageId, emoji) => {
        const res = await request(`/api/chats/${chatId}/messages/${messageId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to toggle reaction')
        return json
    },

    sendPoll: async (chatId, { question, options, multipleAnswers, anonymous, allowRetraction }) => {
        const res = await request(`/api/chats/${chatId}/messages/poll`, {
            method: 'POST',
            body: JSON.stringify({ question, options, multiple_answers: multipleAnswers, anonymous, allow_retraction: allowRetraction }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to create poll')
        return json
    },

    votePoll: async (chatId, messageId, options) => {
        const res = await request(`/api/chats/${chatId}/messages/${messageId}/poll/vote`, {
            method: 'POST',
            body: JSON.stringify({ options }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to vote')
        return json
    },

    retractPollVote: async (chatId, messageId) => {
        const res = await request(`/api/chats/${chatId}/messages/${messageId}/poll/vote`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to retract vote')
        return json
    },

    listScheduledMessages: async (chatId) => {
        const res = await request(`/api/chats/${chatId}/scheduled-messages`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load scheduled messages')
        return json
    },

    createScheduledMessage: async (chatId, { content, scheduledAt, replyToId = null, attachments = [] }) => {
        const body = { content, scheduled_at: scheduledAt }
        if (replyToId) body.reply_to_id = replyToId
        if (attachments.length) body.attachments = attachments.map(a => ({ url: a.url, type: a.type, name: a.name }))
        const res = await request(`/api/chats/${chatId}/scheduled-messages`, {
            method: 'POST',
            body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to schedule message')
        return json
    },

    updateScheduledMessage: async (id, { content, scheduledAt }) => {
        const body = {}
        if (content !== undefined) body.content = content
        if (scheduledAt !== undefined) body.scheduled_at = scheduledAt
        const res = await request(`/api/scheduled-messages/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to update scheduled message')
        return json
    },

    deleteScheduledMessage: async (id) => {
        const res = await request(`/api/scheduled-messages/${id}`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to delete scheduled message')
        return json
    },

    toggleSidebarPin: async (chatId) => {
        const res = await request(`/api/chats/${chatId}/pin-sidebar`, { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to toggle pin')
        return json
    },

    getMessageReadBy: async (chatId, messageId) => {
        const res = await request(`/api/chats/${chatId}/messages/${messageId}/read-by`)
        const json = await res.json().catch(() => ([]))
        if (!res.ok) throw new Error(json.error || 'Failed to load read receipts')
        return json
    },

    getLinkPreview: async (url) => {
        const res = await request(`/api/link-preview?url=${encodeURIComponent(url)}`)
        const json = await res.json().catch(() => null)
        if (!res.ok || !json) return null
        return json
    },

    getChatMedia: async (chatId) => {
        const res = await request(`/api/chats/${chatId}/media`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load media')
        return json  // { items: [...] }
    },
}
