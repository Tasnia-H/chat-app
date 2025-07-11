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
    origin: 'http://localhost:3000', // Frontend URL
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>(); // userId -> socketId

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
        this.server.to(receiverSocketId).emit('receive_message', message);
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
}
