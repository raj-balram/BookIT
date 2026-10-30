// Points everything at a SEPARATE database and switches on load-test mode.
if (process.env.NODE_ENV === "production") {
  throw new Error("Load-test mode must never run in production");
}
process.env.MONGO_URI = process.env.LOAD_MONGO_URI || "mongodb://127.0.0.1:27018/bookit_load?directConnection=true";
process.env.LOAD_TEST = "1";