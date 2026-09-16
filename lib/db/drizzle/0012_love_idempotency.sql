ALTER TABLE "love_messages" DROP CONSTRAINT IF EXISTS "love_messages_sender_client_key";
ALTER TABLE "love_messages" ADD CONSTRAINT "love_messages_sender_conversation_client_key"
  UNIQUE ("sender_id", "conversation_id", "client_message_id");