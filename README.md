# Study Assistant

Paste class notes or type a topic and the app uses an AI model (Google Gemini) to create a summary, a 5-question quiz and flashcards.

## Features
- Notes box, Generate button, and Settings for your own API key (kept in localStorage, never in the code)
- Summary, Quiz (score + correct answers) and Flashcards (click to flip, mark as known) in tabs
- Loading indicator; Generate button disabled while working
- Error messages for: no key, empty input, network failure, 400/401/403/429/other HTTP errors, invalid AI reply
- AI reply is parsed and validated before use
- History in localStorage (click to reopen, delete one or all)
- Copy and Download the summary as .txt, Read aloud (Speech Synthesis)
- Dark / Light toggle that is remembered
- Extras: answer style selector, quiz difficulty, character counter with limit warning, flashcard flip animation and known count

## Get a free API key
1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. Open the app, expand **Settings**, paste the key and click **Save key**.

## How to use
1. Paste notes or type a topic.
2. Choose style and difficulty.
3. Click **Generate study material**.
4. Switch between Summary, Quiz and Flashcards.

## Run locally
Open `index.html` in a browser, or run `npx serve .`.

## Deploy
Push to GitHub, then import the repo in Vercel or Netlify (no build step). **Never commit an API key.**

## Files
`index.html` structure, `style.css` styling, `script.js` logic (buildPrompt, callAI, parseAndValidate, render functions, history).
