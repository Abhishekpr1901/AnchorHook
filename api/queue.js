const amqp = require('amqplib');

// ─────────────────────────────────────────────
// NOTES — Milestone 3
// ─────────────────────────────────────────────
// This sets up a shared RabbitMQ connection + channel — similar in spirit
// to db.js's Postgres Pool. One connection is reused across the app,
// instead of connecting fresh every time we need to publish a message.
//
// connect()       → opens a TCP connection to the RabbitMQ container.
// createChannel() → a lightweight session within that connection.
//                   Multiple channels can share one connection, like
//                   multiple conversations over a single phone line —
//                   cheaper than opening a new connection each time.
// assertQueue()   → creates the queue if it doesn't exist yet, or just
//                   confirms it exists if it's already there. Safe to
//                   call repeatedly, won't error if it's already made.
//
// durable: true   → the queue survives a RabbitMQ restart (similar to
//                   why we gave Postgres a persistent volume — without
//                   this, the queue and its messages could vanish if
//                   the container restarts).

const QUEUE_NAME = 'events_queue';

let channel;

async function getChannel() {
  if (channel) return channel; // reuse if already connected

  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });

  return channel;
}

module.exports = { getChannel, QUEUE_NAME };
