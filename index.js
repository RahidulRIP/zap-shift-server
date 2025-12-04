const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 9000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(`${process.env.STRIPE_SECRET_KEY}`);

// this function create trackingId start
const crypto = require("crypto");

function generateTrackingId() {
  const prefix = "PKG";

  // Format: YYYYMMDD
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");

  // 3 bytes = 6 hex chars, enough for uniqueness
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
}
// this function create trackingId end

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
    const paymentCollection = db.collection("payments");

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
    app.delete("/parcel/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);
      res.send(result);
    });

    // [Payment.jsx]
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);
      res.send(result);
    });

    // stripe [Payment.jsx]
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req?.body;
      const amount = parseInt(paymentInfo?.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo?.parcelName}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo?.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo?.parcelId,
          parcelName: paymentInfo?.parcelName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      // console.log(session);
      res.send({ url: session.url });
    });

    // [PaymentSuccess.jsx]
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req?.query?.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log(session);

      if (!session) {
        return res.status(400).send({
          error: "Invalid session",
        });
      }

      const trackingId = generateTrackingId();
      const transactionId = session?.payment_intent;
      const query = { transactionId };
      const paymentExit = await paymentCollection.findOne(query);
      if (paymentExit) {
        return res.send({
          message: "already exists",
          trackingId: trackingId,
          transactionId: session?.payment_intent,
        });
      }

      if (session?.payment_status === "paid") {
        const parcelId = session?.metadata?.parcelId;
        const filter = { _id: new ObjectId(parcelId) };
        const update = {
          $set: {
            deliveryStatus: "paid",
            trackingId: trackingId,
          },
        };
        const result = await parcelsCollection.updateOne(filter, update);

        const payment = {
          amount: session?.amount_total / 100,
          currency: session?.currency,
          customerEmail: session?.customer_email,
          parcelId: session?.metadata?.parcelId,
          parcelName: session?.metadata?.parcelName,
          paidAt: new Date(),
          transactionId: session?.payment_intent,
          trackingId: trackingId,
        };

        const resultPayment = await paymentCollection.insertOne(payment);
        // console.log(payment);
        res.send({
          success: true,
          modifyParcel: result,
          paymentInfo: resultPayment,
          trackingId: trackingId,
          transactionId: session?.payment_intent,
        });

        return;
      }

      res.send({ success: false });
    });

    app.get("/payments", async (req, res) => {
      const query = {};
      const email = req.query.email;
      if (email) {
        query.customerEmail = email;
      }
      const result = await paymentCollection.find(query).toArray();
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
