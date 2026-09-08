import assert from "node:assert/strict";

import { createRedditDailyEngagementPlan } from "../src/daily.js";
import { flattenRedditTemplateConfig, normalizeRedditLeadTemplate } from "../src/redditTemplates.js";
import type { RedditLead } from "../src/scheduling.js";

function lead(index: number): RedditLead {
  return {
    id: `reddit-asianbeauty-${index}`,
    platform: "reddit",
    status: "pending",
    subreddit: "AsianBeauty",
    title: "Anyone actually look at the ingredient list of their base products?",
    url: `https://www.reddit.com/r/AsianBeauty/comments/1spmbx${index}/ingredient_list/`,
    action: "reply",
    strategy: "Offer a brief ingredient-list comparison without medical framing.",
    templateName: "ingredient_list_helper",
    keyword: "ingredient list",
    threadTitle: "Anyone actually look at the ingredient list of their base products?",
    commentLink: `https://www.reddit.com/r/AsianBeauty/comments/1spmbx${index}/ingredient_list/`,
    commentData: "OP asks whether people look at ingredient lists for base products and which ingredients matter.",
    proposedReply: "If you want, paste the product names or ingredient lists and I can help compare them."
  };
}

{
  const normalized = normalizeRedditLeadTemplate(lead(1));
  assert.equal(normalized.templateName, "scanner_app/comment/general_recommendation");
  assert.notEqual(normalized.proposedReply, lead(1).proposedReply);
  assert.match(normalized.proposedReply ?? "", /pom app/);
  assert.match(normalized.message ?? "", /pom app/);
}

{
  const plan = createRedditDailyEngagementPlan({
    leads: Array.from({ length: 12 }, (_, index) => lead(index + 1)),
    generatedAt: "2026-06-06T23:12:00.000Z"
  });
  const proposal = plan.approvalQueue.leads[0];
  assert.equal(proposal?.templateName, "scanner_app/comment/general_recommendation");
  assert.match(proposal?.proposedReply ?? "", /pom app/);
  assert.doesNotMatch(proposal?.proposedReply ?? "", /paste the product names/);
}

{
  const catalog = flattenRedditTemplateConfig({
    scanner_app: {
      comment_templates: {
        general_recommendation: ["Approved custom template for {keyword} in r/{subreddit}."]
      }
    }
  });
  const normalized = normalizeRedditLeadTemplate(lead(1), { catalog });
  assert.equal(normalized.templateName, "scanner_app/comment/general_recommendation");
  assert.equal(normalized.proposedReply, "Approved custom template for ingredient list in r/AsianBeauty.");
}

{
  const selectedByTmux = {
    ...lead(1),
    templateName: "scanner_app/comment/general_recommendation",
    proposedReply:
      "If you care about what is in your products, the pom app is worth a look. You scan the ingredient list and set your own thresholds for how things get flagged based on the strength of the research."
  };
  const normalized = normalizeRedditLeadTemplate(selectedByTmux);
  assert.equal(normalized.templateName, selectedByTmux.templateName);
  assert.equal(normalized.proposedReply, selectedByTmux.proposedReply);
}

{
  const uploadedPlaybookSelection = {
    ...lead(1),
    strategy: "scanner_app",
    templateName: "comment/ingredient_question/4",
    proposedReply:
      "An uploaded playbook reply about {ingredient} rendered for this lead.",
  };
  const normalized = normalizeRedditLeadTemplate(uploadedPlaybookSelection, {
    preserveSelectedReply: true,
  });
  assert.equal(normalized.templateName, "comment/ingredient_question/4");
  assert.equal(
    normalized.proposedReply,
    uploadedPlaybookSelection.proposedReply,
  );
}

{
  const exactReply = "Some ingredient listings can be deceptive, especially for people with allergies.";
  const operatorReplacement = {
    ...lead(1),
    templateName: "scanner_app/comment/operator_replacement",
    proposedReply: exactReply,
    message: exactReply
  };
  const normalized = normalizeRedditLeadTemplate(operatorReplacement);

  assert.equal(normalized.templateName, "scanner_app/comment/operator_replacement");
  assert.equal(normalized.proposedReply, exactReply);
  assert.equal(normalized.message, exactReply);
}

{
  const selectedAliasByTmux = {
    ...lead(1),
    templateName: "ingredient_list_helper",
    proposedReply:
      "Have you tried scanning the actual ingredients list instead of the barcode? I use the pom app for this and you can customize how ingredients get flagged based on research severity."
  };
  const normalized = normalizeRedditLeadTemplate(selectedAliasByTmux);
  assert.equal(normalized.templateName, "scanner_app/comment/general_recommendation");
  assert.equal(normalized.proposedReply, selectedAliasByTmux.proposedReply);
}

{
  const selectedContextByTmux = {
    ...lead(1),
    templateName: "scanner_app/comment/contextual_recommendation",
    templateVariables: {
      user_goal: "comparing base product ingredients"
    },
    proposedReply:
      "For comparing base product ingredients, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity."
  };
  const normalized = normalizeRedditLeadTemplate(selectedContextByTmux);
  assert.equal(normalized.templateName, "scanner_app/comment/contextual_recommendation");
  assert.equal(
    normalized.proposedReply,
    "For comparing base product ingredients, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity."
  );
}

{
  const selectedContextWithRawQuestionTitle = {
    ...lead(1),
    id: "reddit-makeupaddiction-1dss86q",
    templateName: "scanner_app/comment/contextual_recommendation",
    keyword: "brands do you trust",
    threadTitle: "Which brands do you trust? (avoiding clean/moldy beauty?)",
    commentData:
      "Which brands do you trust? (i keep seeing more and more reports about products that are moldy or unsafe in some other way)",
    templateVariables: {
      user_goal: "Which brands do you trust? (i keep seeing more and more reports about products that are"
    },
    proposedReply:
      "For Which brands do you trust? (i keep seeing more and more reports about products that are, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity."
  };
  const normalized = normalizeRedditLeadTemplate(selectedContextWithRawQuestionTitle);

  assert.equal(normalized.templateName, "scanner_app/comment/contextual_recommendation");
  assert.equal(
    normalized.proposedReply,
    "For choosing reputable brands, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity."
  );
  assert.doesNotMatch(normalized.proposedReply ?? "", /Which brands do you trust/);
}

{
  const selectedContextWithIngredientQuote = {
    ...lead(1),
    id: "reddit-makeupaddiction-1nbvynv",
    templateName: "scanner_app/comment/contextual_recommendation",
    keyword: "makeup ingredients",
    threadTitle: "I am looking for something formulated like this",
    commentData:
      "I\u2019m looking for something formulated like this: \"Water, Cyclopentasiloxane, Peg-10 Dimethicone, Isododecane, Butylene Glycol, Acrylates/Polytrimethylsiloxymethacrylate Copolymer\"",
    templateVariables: {
      user_goal:
        "I\u2019m looking for something formulated like this: \"Water, Cyclopentasiloxane, Peg-10 Dimethicone, Isododecane, Butylene Glycol, Acrylates/Polytrimethylsiloxymethacrylate Copolymer"
    },
    proposedReply:
      "For I\u2019m looking for something formulated like this: \"Water, Cyclopentasiloxane, Peg-10 Dimethicone, Isododecane, Butylene Glycol, Acrylates/Polytrimethylsiloxymethacrylate Copolymer, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity."
  };
  const normalized = normalizeRedditLeadTemplate(selectedContextWithIngredientQuote);

  assert.equal(normalized.templateName, "scanner_app/comment/contextual_recommendation");
  assert.equal(
    normalized.proposedReply,
    "For finding products with a similar ingredient list, the pom app may be useful because it scans the ingredient list directly and lets you set flagging thresholds based on research severity."
  );
  assert.doesNotMatch(normalized.proposedReply ?? "", /Cyclopentasiloxane|formulated like this/i);
}

{
  const catalog = flattenRedditTemplateConfig({
    scanner_app: {
      comment_templates: {
        ingredient_question: ["Great question about {ingredient}. I would compare it against {topic} before deciding."]
      }
    }
  });
  const selectedByTmux = {
    ...lead(1),
    templateName: "scanner_app/comment/ingredient_question",
    templateVariables: {
      ingredient: "zinc oxide",
      topic: "your base product ingredient list"
    },
    proposedReply: "placeholder copy that must be rendered by deterministic code"
  };
  const normalized = normalizeRedditLeadTemplate(selectedByTmux, { catalog });
  assert.equal(normalized.templateName, "scanner_app/comment/ingredient_question");
  assert.equal(
    normalized.proposedReply,
    "Great question about zinc oxide. I would compare it against your base product ingredient list before deciding."
  );
}

{
  const catalog = flattenRedditTemplateConfig({
    scanner_app: {
      comment_templates: {
        contextual_recommendation: ["If you are trying to {user_goal}, the pom app is worth a look."]
      }
    }
  });
  const normalized = normalizeRedditLeadTemplate({
    ...lead(1),
    templateName: "scanner_app/comment/contextual_recommendation",
    templateVariables: {
      user_goal: "User asks what to look for and avoid in moisturizer ingredients"
    },
    proposedReply: "ignored"
  }, { catalog });

  assert.equal(
    normalized.proposedReply,
    "If you are trying to figure out what to look for and avoid in moisturizer ingredients, the pom app is worth a look."
  );
}

{
  const catalog = flattenRedditTemplateConfig({
    scanner_app: {
      comment_templates: {
        contextual_recommendation: ["For questions about {product_context}, the pom app is worth a look."]
      }
    }
  });
  const normalized = normalizeRedditLeadTemplate({
    ...lead(1),
    templateName: "scanner_app/comment/contextual_recommendation",
    templateVariables: {
      product_context: "ingredient checking app / Ingredient checking app or site"
    },
    proposedReply: "ignored"
  }, { catalog });

  assert.equal(normalized.proposedReply, "For questions about ingredient checking app, the pom app is worth a look.");
}

{
  const catalog = flattenRedditTemplateConfig({
    scanner_app: {
      comment_templates: {
        ingredient_question: ["Great question about {ingredient}."]
      }
    }
  });
  const normalized = normalizeRedditLeadTemplate({
    ...lead(1),
    templateName: "scanner_app/comment/ingredient_question",
    keyword: "ingredient list",
    templateVariables: {
      ingredient: "   "
    },
    proposedReply: "ignored"
  }, { catalog });

  assert.equal(normalized.proposedReply, "Great question about ingredient list.");
}
