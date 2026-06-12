import { getDatabase } from "firebase/database";
import { app } from "./firebase";

export const rtdb = getDatabase(app);
