"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useAuth } from "./AuthContext";

interface NotificationContextType {
  requestNotificationPermission: () => Promise<void>;
  showNotification: (title: string, body: string, icon?: string) => void;
  isNotificationSupported: boolean;
  notificationPermission: NotificationPermission;
  isPageVisible: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isNotificationSupported, setIsNotificationSupported] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Check if notifications are supported in the browser
    const supported = typeof window !== "undefined" && "Notification" in window;
    setIsNotificationSupported(supported);

    if (supported) {
      setNotificationPermission(Notification.permission);
    }

    // Track page visibility
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      }
    };
  }, []);

  const requestNotificationPermission = async () => {
    if (!isNotificationSupported) {
      console.log("Notifications not supported");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

  const showNotification = (title: string, body: string, icon?: string) => {
    if (
      !isNotificationSupported ||
      notificationPermission !== "granted" ||
      isPageVisible
    ) {
      return;
    }

    try {
      const notification = new Notification(title, {
        body,
        icon: icon || "/favicon.ico",
        badge: "/favicon.ico",
        tag: "chat-message", // This will replace previous notifications
        requireInteraction: false,
        silent: false,
      });

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        requestNotificationPermission,
        showNotification,
        isNotificationSupported,
        notificationPermission,
        isPageVisible,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotification must be used within a NotificationProvider"
    );
  }
  return context;
};
