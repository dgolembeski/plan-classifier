// backend/update-data.js
import { refreshReferenceData } from "./server.js";
await refreshReferenceData();
console.log("Data refresh complete");
