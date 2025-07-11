"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import io from "socket.io-client";
type SocketType = ReturnType<typeof io>;

interface User {
  id: string;
  email: string;
  username: string;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: User;
  receiver: User;
}

export default function ChatInterface() {
  const { user, token, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<SocketType | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUsers();

    // Initialize socket connection
    const socketInstance = io("http://localhost:3001", {
      auth: { token },
    });

    setSocket(socketInstance);

    socketInstance.on("receive_message", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketInstance.on("message_sent", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketInstance.on("messages_history", (history: Message[]) => {
      setMessages(history);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("http://localhost:3001/users", {
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

    if (socket) {
      socket.emit("get_messages", { otherUserId: selectedUser.id });
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

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r border-gray-300">
        <div className="p-4 border-b border-gray-300">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Messages</h1>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
          <p className="text-sm text-gray-600">Welcome, {user?.username}!</p>
        </div>

        <div className="overflow-y-auto">
          {users.map((u) => (
            <div
              key={u.id}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                selectedUser?.id === u.id ? "bg-blue-50 border-blue-200" : ""
              }`}
              onClick={() => selectUser(u)}
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 font-medium">
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{u.username}</h3>
                  <p className="text-sm text-gray-500">{u.email}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-300 p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 font-medium">
                    {selectedUser.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="font-medium text-gray-900">
                    {selectedUser.username}
                  </h2>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.sender.id === user?.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className="text-xs mt-1 opacity-75">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form
              onSubmit={sendMessage}
              className="bg-white border-t border-gray-300 p-4"
            >
              <div className="flex space-x-4">
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
                  className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
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
