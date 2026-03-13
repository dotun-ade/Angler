import { google } from "googleapis";

/**
 * Fetches the plain text content of a Google Doc using the Docs API.
 * Returns null (and logs) if the fetch fails so callers can fall back gracefully.
 */
export async function fetchGoogleDocText(
  docId: string,
  serviceAccountJson: string,
): Promise<string | null> {
  try {
    const credentials = JSON.parse(serviceAccountJson);
    const jwt = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        "https://www.googleapis.com/auth/documents.readonly",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });

    const docsApi = google.docs({ version: "v1", auth: jwt });
    const res = await docsApi.documents.get({ documentId: docId });
    const content = res.data.body?.content ?? [];

    const textParts: string[] = [];
    for (const element of content) {
      if (!element.paragraph) continue;
      for (const pElement of element.paragraph.elements ?? []) {
        const text = pElement.textRun?.content;
        if (text) textParts.push(text);
      }
    }

    return textParts.join("").trim() || null;
  } catch (error) {
    console.error("Failed to fetch Google Doc content:", error);
    return null;
  }
}
