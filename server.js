/* ==================================================
   IMPORT SERVER
   Small Express server that powers the website-import
   feature for Kayla's Family Meal Planner.

   The website (hosted on GitHub Pages) calls
   POST /api/importRecipe with a recipe URL; this
   server fetches the page, reads its recipe data,
   and returns it as clean JSON.
================================================== */

const express = require("express");
const { importRecipeFromUrl } = require("./recipeParser.js");

const app = express();

app.use(express.json());

// --- CORS: let the website call this server from the browser ---
// Defaults to "*" (any site). You can lock it to your own site later by
// setting an ALLOWED_ORIGIN variable in Railway.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Friendly landing page so opening the URL in a browser shows something.
app.get("/", function (req, res) {
  res.send("Kayla's Family Meal Planner import server is running.");
});

// Website recipe import
app.post("/api/importRecipe", async function (req, res) {
  const rawUrl = req.body && req.body.url;

  if (!rawUrl || typeof rawUrl !== "string") {
    return res.status(400).json({ error: "Please enter a recipe link." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl.trim());
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("bad protocol");
    }
  } catch (error) {
    return res
      .status(400)
      .json({ error: "That doesn't look like a valid web address." });
  }

  try {
    const recipe = await importRecipeFromUrl(parsedUrl.href);
    res.json(recipe);
  } catch (error) {
    res.status(502).json({ error: error.message || "Import failed." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log("Import server running on port " + PORT);
});
