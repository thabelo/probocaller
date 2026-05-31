import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
// 1:1 conversation. participantA < participantB (canonical) so a pair maps to one row.
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn() id: number;
  @Column() participantA: number;
  @Column() participantB: number;
  @Column() initiatorId: number;
  @Column({ default: false }) accepted: boolean;
  @CreateDateColumn() createdAt: Date;
}
