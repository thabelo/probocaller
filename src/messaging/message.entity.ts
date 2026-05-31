import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';
@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() conversationId: number;
  @Column() senderId: number;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'timestamp', nullable: true }) readAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
