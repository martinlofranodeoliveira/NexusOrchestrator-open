"use strict";

// Automated work is an explicit user choice in the distributable edition.
function openEditionOptIn(value) {
  return typeof value === "string" && value.toLowerCase() === "true";
}

module.exports = { openEditionOptIn };
