import mongoose from "mongoose";

const uris = [
  "mongodb://127.0.0.1:27017/bookit_load?replicaSet=rs0",
  "mongodb://localhost:27017/bookit_load?replicaSet=rs0",
  "mongodb://127.0.0.1:27017/bookit_load?directConnection=true",
];

for (const uri of uris) {
  try {
    await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log("OK  ", uri);
  } catch (e) {
    console.log("FAIL", uri, "-", e.name);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}