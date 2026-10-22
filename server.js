import createApp from "./src/app.js";
import { openDatabase } from "./src/database.js";

const app = createApp(openDatabase());
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Onderhoudslogboek draait op http://localhost:${port}`);
});
