const { MongoClient } = require("mongodb");
let client;
let database;
async function connectDB() {
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is missing from environment variables.");
  }
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15000
  });
  await client.connect();
  database = client.db("arynexa_ai");
  await database.command({ ping: 1 });
  await database.collection("users").createIndex(
    { email: 1 },
    { unique: true, name: "unique_user_email" }
  );
  console.log("MongoDB Atlas connected successfully.");
  console.log("Authentication database indexes ready.");
  return database;
}
function getDB() {
  if (!database) {
    throw new Error("Database is not connected. Call connectDB() first.");
  }
  return database;
}
async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}
module.exports = { connectDB, getDB, closeDB };
