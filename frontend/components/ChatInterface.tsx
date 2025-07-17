"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import io from "socket.io-client";
type SocketType = ReturnType<typeof io>;

interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  sender: User;
  receiver: User;
  isNewMessage?: boolean;
}

export default function ChatInterface() {
  const { user, token, logout } = useAuth();
  const {
    requestNotificationPermission,
    showNotification,
    isNotificationSupported,
    notificationPermission,
    isPageVisible,
  } = useNotification();

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<SocketType | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUsers();

    // Initialize socket connection
    const socketInstance = io("https://calabbk.solar-ict.com", {
      auth: { token },
    });

    setSocket(socketInstance);

    // Handle incoming messages
    socketInstance.on("receive_message", (message: Message) => {
      setMessages((prev) => [...prev, message]);

      // Show browser notification if page is not visible
      if (message.isNewMessage && !isPageVisible) {
        showNotification(
          `New message from ${message.sender.username}`,
          message.content,
          "/favicon.ico"
        );
      }
    });

    socketInstance.on("message_sent", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketInstance.on("messages_history", (history: Message[]) => {
      setMessages(history);
    });

    // Handle unread counts
    socketInstance.on("unread_counts", (counts: Record<string, number>) => {
      setUnreadCounts(counts);
    });

    socketInstance.on("messages_marked_read", (data: { senderId: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.sender.id === data.senderId ? { ...msg, isRead: true } : msg
        )
      );
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [token, isPageVisible, showNotification]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Show notification permission prompt after user interaction
    if (isNotificationSupported && notificationPermission === "default") {
      setShowNotificationPrompt(true);
    }
  }, [isNotificationSupported, notificationPermission]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("https://calabbk.solar-ict.com/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const selectUser = (selectedUser: User) => {
    setSelectedUser(selectedUser);
    setMessages([]);
    setShowSidebar(false); // Close sidebar on mobile after selection

    if (socket) {
      socket.emit("get_messages", { otherUserId: selectedUser.id });
      socket.emit("set_active_chat", { receiverId: selectedUser.id });
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    socket.emit("send_message", {
      receiverId: selectedUser.id,
      content: newMessage,
    });

    setNewMessage("");
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleNotificationPermission = async () => {
    await requestNotificationPermission();
    setShowNotificationPrompt(false);
  };

  const getTotalUnreadCount = () => {
    return Object.values(unreadCounts).reduce(
      (total, count) => total + count,
      0
    );
  };

  // Update document title with unread count
  useEffect(() => {
    const totalUnread = getTotalUnreadCount();
    document.title =
      totalUnread > 0
        ? `(${totalUnread}) Solar-ICT Chat App`
        : "Solar-ICT Chat App";
  }, [unreadCounts]);

  return (
    <div className="flex h-screen bg-gray-100 relative overflow-hidden">
      {/* Notification Permission Prompt */}
      {showNotificationPrompt && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm">
          <div className="flex items-center space-x-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Enable notifications</p>
              <p className="text-xs opacity-90">
                Get notified when you receive new messages
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleNotificationPermission}
                className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100"
              >
                Enable
              </button>
              <button
                onClick={() => setShowNotificationPrompt(false)}
                className="text-white hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-gray-100 bg-opacity-75 z-40 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-gray-300 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:w-1/4 flex flex-col`}
      >
        <div className="p-4 border-b border-gray-300 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold">Messages</h1>
              {getTotalUnreadCount() > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                  {getTotalUnreadCount()}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
              <button
                onClick={() => setShowSidebar(false)}
                className="md:hidden text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600 truncate">
            Welcome, {user?.username}!
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {users && users.length > 0 ? (
            users.map((u) => (
              <div
                key={u.id}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedUser?.id === u.id ? "bg-blue-50 border-blue-200" : ""
                }`}
                onClick={() => selectUser(u)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {u.avatar ? (
                        <img
                          src={u.avatar}
                          alt={u.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-600 font-medium">
                          {u.username.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {u.username}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>
                  {unreadCounts[u.id] > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center flex-shrink-0">
                      {unreadCounts[u.id]}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              <p>Loading users...</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-300 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowSidebar(true)}
                    className="md:hidden text-gray-500 hover:text-gray-700 mr-2"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </button>
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                    {selectedUser.avatar ? (
                      <img
                        src={selectedUser.avatar}
                        alt={selectedUser.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-600 font-medium">
                        {selectedUser.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-gray-900 truncate">
                      {selectedUser.username}
                    </h2>
                    <p className="text-sm text-gray-500 truncate">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
                {unreadCounts[selectedUser.id] > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                    {unreadCounts[selectedUser.id]} unread
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.sender.id === user?.id
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs sm:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-2 rounded-lg ${
                      message.sender.id === user?.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    <p className="text-sm break-words">{message.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs opacity-75">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {message.sender.id === user?.id && (
                        <span className="text-xs opacity-75 ml-2">
                          {message.isRead ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-gray-300 p-4 flex-shrink-0">
              <form onSubmit={sendMessage}>
                <div className="flex space-x-2 sm:space-x-4">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              {/* Mobile Hamburger Icon */}
              <button
                onClick={() => setShowSidebar(true)}
                className="md:hidden mb-4 p-3 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                aria-label="Open conversations"
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a conversation
              </h3>
              <p className="text-gray-500">
                Choose a user from the sidebar to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
