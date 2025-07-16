/*
  Warnings:

  - You are about to drop the column `isOnline` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastSeen` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "isOnline",
DROP COLUMN "lastSeen";
