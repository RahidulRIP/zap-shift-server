const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 9000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.v3edin0.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send(`zap shift server is running`);
});

async function run() {
  try {
    await client.connect();
    // ---------------------------------------------------------------
    const db = client.db("zap_shift_db");
    const parcelsCollection = db.collection("parcels");

    // [MyParcels.jsx]
    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email } = req.query;
      const options = { sort: { createdAt: -1 } };
      if (email) {
        query.senderEmail = email;
      }
      const result = await parcelsCollection.find(query, options).toArray();
      res.send(result);
    });

    //[SendParcel.jsx]
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.createdAt = new Date();
      const result = await parcelsCollection.insertOne(parcel);
      res.send(result);
    });

    // [MyParcels.jsx]
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);
      res.send(result);
    });

    // ---------------------------------------------------------------
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    //do not close client
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`this server is running from ${port}`);
});
