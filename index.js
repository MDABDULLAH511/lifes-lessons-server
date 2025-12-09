const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
//Stripe Payment Gateway Required
const stripe = require("stripe")(process.env.STRIPE_API);

const port = process.env.PORT || 3000;

//Middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_Pass}@cluster0.lrwjn45.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // ===== ***** ===== Database Collection Create ===== ***** =====//
    const db = client.db("Life's_Lesson_DB");
    const userCollection = db.collection("users");
    const lessonsCollection = db.collection("lessons");

    // ===== ===== Users Related Api ===== =====//
    // Get users API
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      const query = {};

      if (email) {
        query.email = email;
      }

      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    //get users by status (Membership / Role)
    app.get("/users/:email/status", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });

      res.send({
        isPremium: user?.isPremium || false,
        role: user?.role || "user",
      });
    });

    //create user. Post API
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.isPremium = false;
      user.role = "user";

      //check user already exit or not
      const email = user.email;
      const userExits = await userCollection.findOne({ email });

      if (userExits) {
        return res.send({ message: "User already exits" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // ===== ===== Lesson Related Api ===== =====//
    // Get API lessons (All and using email).
    app.get("/lessons", async (req, res) => {
      const { email } = req.query;

      const query = {};

      if (email) {
        query.createdBy = email;
      }

      const cursor = lessonsCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get API lessons. Get by ID
    app.get("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await lessonsCollection.findOne(query);
      res.send(result);
    });

    //Post API Create Lessons.
    app.post("/lessons", async (req, res) => {
      const lesson = req.body;
      lesson.createdAt = new Date();

      const result = await lessonsCollection.insertOne(lesson);
      res.send(result);
    });

    //Patch API, Update Lesson.
    app.patch("/lessons/:id", async (req, res) => {
      const lesson = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          lessonTitle: lesson.lessonTitle,
          category: lesson.category,
          emotionalTone: lesson.emotionalTone,
          privacy: lesson.privacy,
          accessLevel: lesson.accessLevel,
          lessonImage: lesson.lessonImage,
          lessonDesc: lesson.lessonDesc,

          lastUpdatedDate: new Date(),
        },
      };

      const result = await lessonsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //Delete API Delete lesson.
    app.delete("/lessons/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await lessonsCollection.deleteOne(query);
      res.send(result);
    });

    // ===== ===== Payments Related Api ===== =====//
    app.post("/create-checkout-session", async (req, res) => {
      const userInfo = req.body;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: {
                name: "Premium Lifetime Plan",
                description:
                  "Unlock all features, premium lessons & lifetime access.",
              },
              unit_amount: 150000, // 1500 taka
            },
            quantity: 1,
          },
        ],
        customer_email: userInfo.email,
        mode: "payment",
        metadata: {
          userId: userInfo._id, // YES! This is totally valid
          email: userInfo.email, // also okay
        },

        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      //Check payment exits or not
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await userCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "Already Exists",
          transactionId,
        });
      }

      if (session.payment_status === "paid") {
        const userId = session.metadata.userId;
        const query = { _id: new ObjectId(userId) };

        const updateDoc = {
          $set: {
            isPremium: true,
            transactionId: session.payment_intent,
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      }
      res.send({ success: true });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Life's Lessons Server Is Running...");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
