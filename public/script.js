const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');

/**
 * Formats a markdown-like text string from the bot into HTML.
 * Handles:
 * - Code blocks (```lang\ncode\n```)
 * - Bold text (**text**)
 * - Inline code (`text`)
 * - Unordered lists (* item / - item)
 * - Newlines (converted to <br>)
 * @param {string} markdownText - The text from the bot.
 * @returns {string} HTML string.
 */
function formatBotMessage(markdownText) {
  let html = markdownText;

  // 1. Code blocks (```...```)
  // Must be processed first due to their multi-line nature and potential to contain other markdown characters.
  html = html.replace(/```(?:(\w+)\n)?([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? `language-${lang.trim()}` : '';
    // Escape HTML special characters inside the code block
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code class="${langClass}">${escapedCode.trim()}</code></pre>`;
  });

  // Temporarily replace <pre> blocks to protect their content from other markdown processing
  const preBlocks = [];
  let tempHtml = html.replace(/<pre>[\s\S]*?<\/pre>/g, (match) => {
    preBlocks.push(match);
    return `__PRE_PLACEHOLDER_${preBlocks.length - 1}__`;
  });

  // 2. Bold (**text**)
  tempHtml = tempHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 3. Inline code (`text`)
  tempHtml = tempHtml.replace(/`(.*?)`/g, '<code>$1</code>');

  // 4. Lists (* item or - item)
  // Process line by line to correctly group <ul> and <li>
  const lines = tempHtml.split('\n');
  const newLines = [];
  let inList = false;
  let currentListIndent = ''; // To handle indentation of the <ul> tag

  for (const line of lines) {
    const listMatch = line.match(/^(\s*)(\*|\-)\s+(.*)/); // Matches lines like "* item" or "- item"
    if (listMatch) {
      const indent = listMatch[1];
      const itemContent = listMatch[3]; // Content already processed for bold/inline code

      if (!inList) {
        currentListIndent = indent; // Store the indentation of the list
        newLines.push(`${currentListIndent}<ul>`);
        inList = true;
      }
      // Ensure list items are indented relative to the list itself
      newLines.push(`${currentListIndent}  <li>${itemContent}</li>`);
    } else {
      if (inList) {
        newLines.push(`${currentListIndent}</ul>`); // Close the list with its original indentation
        inList = false;
        currentListIndent = ''; // Reset indent
      }
      newLines.push(line); // Add non-list lines as they are
    }
  }
  if (inList) { // If the text ends with a list, close it
    newLines.push(`${currentListIndent}</ul>`);
  }
  tempHtml = newLines.join('\n');

  // 5. Convert remaining newlines to <br> tags
  tempHtml = tempHtml.replace(/\n/g, '<br>');

  // Restore <pre> blocks. The placeholder should not have <br> tags within it.
  preBlocks.forEach((block, index) => {
    const placeholderRegex = new RegExp(`__PRE_PLACEHOLDER_${index}__(<br>)*`, 'g');
    tempHtml = tempHtml.replace(placeholderRegex, block);
  });

  // Clean up common issues:
  // - Remove <br> tags immediately inside <li> or at the very start/end of <ul> content
  tempHtml = tempHtml.replace(/<li><br>/g, '<li>').replace(/<br><\/li>/g, '</li>');
  tempHtml = tempHtml.replace(/<ul><br>/g, '<ul>').replace(/<br><\/ul>/g, '</ul>');
  // - Consolidate multiple <br> tags (e.g., from empty lines) into paragraph-like breaks
  tempHtml = tempHtml.replace(/(<br>\s*){2,}/g, '<br><br>');
  // - Remove leading or trailing <br> tags from the whole message
  tempHtml = tempHtml.replace(/^<br\s*\/?>\s*/i, '').replace(/\s*<br\s*\/?>\s*$/i, '');


  return tempHtml;
}

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  appendMessage('user', userMessage);
  input.value = '';

  // Send message to the backend and get Gemini's response
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: userMessage }),
    });

    if (!response.ok) {
      // Try to parse error message from backend if available
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.reply || errorData.message || errorMessage;
      } catch (parseError) {
        // If parsing fails, stick to the HTTP error
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    appendMessage('bot', data.reply);
  } catch (error) {
    console.error('Error sending message to backend:', error);
    appendMessage('bot', `Sorry, something went wrong: ${error.message}`);
  }
});

function appendMessage(sender, text) {
  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}
