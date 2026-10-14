import { redirect } from "next/navigation";

/** Sends readers to the API's Swagger UI. */
export default function ApiDocs() {
  redirect(`${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "")}/docs`);
}
