import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
//import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: 'https://calabfr.solar-ict.com', // Frontend URL
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>(); // userId -> socketId
  private userActiveChats = new Map<string, string>(); // userId -> activeReceiverId

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      
      this.connectedUsers.set(userId, client.id);
      client.join(userId);
      
      // Send initial unread counts
      await this.sendUnreadCounts(userId);
      
      console.log(`User ${userId} connected`);
    } catch (error) {
      console.log('Unauthorized connection');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.connectedUsers.entries()) {
      if (socketId === client.id) {
        this.connectedUsers.delete(userId);
        this.userActiveChats.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; content: string },
  ) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const senderId = payload.sub;

      // Save message to database
      const message = await this.prisma.message.create({
        data: {
          content: data.content,
          senderId,
          receiverId: data.receiverId,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          receiver: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      // Send to receiver if online
      const receiverSocketId = this.connectedUsers.get(data.receiverId);
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('receive_message', {
          ...message,
          isNewMessage: true,
        });

        // Send updated unread counts to receiver
        await this.sendUnreadCounts(data.receiverId);
      }

      // Send confirmation to sender
      client.emit('message_sent', message);
    } catch (error) {
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('get_messages')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { otherUserId: string },
  ) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const currentUserId = payload.sub;

      const messages = await this.prisma.message.findMany({
        where: {
          OR: [
            {
              senderId: currentUserId,
              receiverId: data.otherUserId,
            },
            {
              senderId: data.otherUserId,
              receiverId: currentUserId,
            },
          ],
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          receiver: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      client.emit('messages_history', messages);
    } catch (error) {
      client.emit('error', { message: 'Failed to get messages' });
    }
  }

  @SubscribeMessage('mark_messages_read')
  async handleMarkMessagesRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { senderId: string },
  ) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const currentUserId = payload.sub;

      // Mark all messages from senderId to currentUserId as read
      await this.prisma.message.updateMany({
        where: {
          senderId: data.senderId,
          receiverId: currentUserId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });

      // Update unread counts for current user
      await this.sendUnreadCounts(currentUserId);

      // IMPORTANT: Notify the sender that their messages were read
      const senderSocketId = this.connectedUsers.get(data.senderId);
      if (senderSocketId) {
        this.server.to(senderSocketId).emit('messages_marked_read', {
          senderId: data.senderId,
          receiverId: currentUserId,
        });
      }

      // Also notify the current user
      client.emit('messages_marked_read', { 
        senderId: data.senderId,
        receiverId: currentUserId,
      });
    } catch (error) {
      client.emit('error', { message: 'Failed to mark messages as read' });
    }
  }

  @SubscribeMessage('set_active_chat')
  async handleSetActiveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string | null },
  ) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const currentUserId = payload.sub;

      if (data.receiverId) {
        this.userActiveChats.set(currentUserId, data.receiverId);
        
        // Auto-mark messages as read when opening chat
        const updatedMessages = await this.prisma.message.updateMany({
          where: {
            senderId: data.receiverId,
            receiverId: currentUserId,
            isRead: false,
          },
          data: {
            isRead: true,
          },
        });

        // Send updated unread counts
        await this.sendUnreadCounts(currentUserId);

        // IMPORTANT: If messages were marked as read, notify the sender
        if (updatedMessages.count > 0) {
          const senderSocketId = this.connectedUsers.get(data.receiverId);
          if (senderSocketId) {
            this.server.to(senderSocketId).emit('messages_marked_read', {
              senderId: data.receiverId,
              receiverId: currentUserId,
            });
          }
        }
      } else {
        this.userActiveChats.delete(currentUserId);
      }
    } catch (error) {
      client.emit('error', { message: 'Failed to set active chat' });
    }
  }

  @SubscribeMessage('get_unread_counts')
  async handleGetUnreadCounts(@ConnectedSocket() client: Socket) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwtService.verify(token);
      const currentUserId = payload.sub;

      await this.sendUnreadCounts(currentUserId);
    } catch (error) {
      client.emit('error', { message: 'Failed to get unread counts' });
    }
  }

  private async sendUnreadCounts(userId: string) {
    try {
      const unreadCounts = await this.prisma.message.groupBy({
        by: ['senderId'],
        where: {
          receiverId: userId,
          isRead: false,
        },
        _count: {
          id: true,
        },
      });

      const counts = unreadCounts.reduce((acc, item) => {
        acc[item.senderId] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      const socketId = this.connectedUsers.get(userId);
      if (socketId) {
        this.server.to(socketId).emit('unread_counts', counts);
      }
    } catch (error) {
      console.error('Failed to send unread counts:', error);
    }
  }
}