/* ==================================================
   RECIPE PARSER
   Pulls a recipe out of a webpage's schema.org
   JSON-LD data and normalizes it into the shape the
   front-end form expects:
     { title, servings, instructions, ingredients:[{amount,unit,name}], category, photo, notes }
================================================== */

function stripHtml(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const regex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function isRecipeNode(node) {
  if (!node || typeof node !== "object") return false;
  const type = node["@type"];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some(function (t) {
    return String(t).toLowerCase() === "recipe";
  });
}

function findRecipeNode(data) {
  const found = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node["@graph"]) walk(node["@graph"]);
    if (isRecipeNode(node)) found.push(node);
  }

  walk(data);
  return found[0] || null;
}

function parseRecipeFromHtml(html) {
  const blocks = extractJsonLdBlocks(html);

  for (const block of blocks) {
    let data;
    try {
      data = JSON.parse(block.trim());
    } catch (error) {
      continue;
    }
    const recipe = findRecipeNode(data);
    if (recipe) return recipe;
  }

  return null;
}

function parseServings(recipeYield) {
  if (recipeYield == null) return "";
  const value = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  const match = String(value).match(/\d+/);
  return match ? match[0] : "";
}

function parseImage(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return parseImage(image[0]);
  if (typeof image === "object") return image.url || "";
  return "";
}

function parseInstructions(instructions) {
  if (!instructions) return "";
  if (typeof instructions === "string") return stripHtml(instructions);

  if (Array.isArray(instructions)) {
    const steps = [];

    instructions.forEach(function (item) {
      if (typeof item === "string") {
        steps.push(stripHtml(item));
      } else if (item && typeof item === "object") {
        if (
          item["@type"] === "HowToSection" &&
          Array.isArray(item.itemListElement)
        ) {
          item.itemListElement.forEach(function (step) {
            if (typeof step === "string") steps.push(stripHtml(step));
            else if (step && step.text) steps.push(stripHtml(step.text));
          });
        } else if (item.text) {
          steps.push(stripHtml(item.text));
        }
      }
    });

    return steps.filter(Boolean).join("\n");
  }

  return "";
}

function parseIngredientLine(line) {
  const cleaned = stripHtml(line).replace(/\s+/g, " ").trim();

  const amountMatch = cleaned.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?)/i
  );

  let amount = "";
  let unit = "";
  let name = cleaned;

  if (amountMatch) {
    amount = amountMatch[0]
      .replace(/\s*(?:-|–|—|to)\s*/, "-")
      .replace(/\s+/, " ")
      .trim();

    let rest = cleaned.slice(amountMatch[0].length).trim();

    let sizeNote = "";
    const parenMatch = rest.match(/^\(([^)]*)\)\s*/);
    if (parenMatch) {
      sizeNote = parenMatch[1].trim();
      rest = rest.slice(parenMatch[0].length).trim();
    }

    const unitMatch = rest.match(
      /^(cups?|tablespoons?|tbsps?|tbs|tsps?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|mls?|liters?|pints?|quarts?|gallons?|cloves?|sticks?|slices?|cans?|jars?|packages?|pkgs?|boxes?|box|bags?|bunch(?:es)?|heads?|sprigs?|pinch(?:es)?|dash(?:es)?|handfuls?|pieces?|fillets?)\b\.?/i
    );

    if (unitMatch) {
      unit = unitMatch[1].replace(/\.$/, "").trim();
      name = rest.slice(unitMatch[0].length).trim();
    } else {
      name = rest;
    }

    if (sizeNote) {
      name = "(" + sizeNote + ") " + name;
    }
  }

  return { amount: amount, unit: unit, name: name.trim() };
}

function normalizeRecipe(recipe) {
  const category = Array.isArray(recipe.recipeCategory)
    ? recipe.recipeCategory[0]
    : recipe.recipeCategory || "";

  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map(parseIngredientLine)
    : [];

  return {
    title: recipe.name ? stripHtml(recipe.name) : "",
    servings: parseServings(recipe.recipeYield),
    instructions: parseInstructions(recipe.recipeInstructions),
    ingredients: ingredients,
    category: stripHtml(category),
    photo: parseImage(recipe.image),
    notes: "",
  };
}

async function importRecipeFromUrl(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      redirect: "follow",
    });
  } catch (error) {
    throw new Error(
      "Could not reach that website. Double-check the link and try again."
    );
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new Error(
      "That website blocks automatic importing. Try a different site, or use Paste Recipe instead."
    );
  }

  if (!response.ok) {
    throw new Error(
      "Could not load that page (error " + response.status + ")."
    );
  }

  const html = await response.text();
  const recipe = parseRecipeFromHtml(html);

  if (!recipe) {
    throw new Error(
      "Couldn't find a recipe on that page. Try a different link, or use Paste Recipe."
    );
  }

  return normalizeRecipe(recipe);
}

module.exports = {
  importRecipeFromUrl,
  parseRecipeFromHtml,
  normalizeRecipe,
  parseIngredientLine,
};
