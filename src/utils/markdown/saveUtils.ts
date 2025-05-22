import { htmlToMarkdown } from './index';

type MarkAttributes = {
  href?: string;
  level?: number;
  language?: string;
  checked?: boolean;
};

interface ContentNode {
  type: string;
  content?: Array<ContentNode | TextNode>;
  attrs?: Record<string, MarkAttributes[keyof MarkAttributes]>;
  [key: string]: unknown;
}

interface TextNode {
  type?: string;
  text?: string;
  marks?: Array<{
    type: string;
    attrs?: Record<string, MarkAttributes[keyof MarkAttributes]>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface TiptapJSON {
  type?: string;
  content?: Array<ContentNode | TextNode>;
  [key: string]: unknown;
}

interface TiptapEditor {
  getJSON: () => TiptapJSON;
  getHTML: () => string;
}

/**
 * Creates a simple HTML renderer for JSON content
 * This is used when we don't have direct access to the Tiptap editor
 */
export const createHtmlRenderer = (content: TiptapJSON) => {
  return {
    getJSON: () => content,
    getHTML: () => {
      // Simple conversion of the nodes to HTML
      let html = '';
      
      const processNode = (node: ContentNode): string => {
        let result = '';
        
        switch (node.type) {
          case 'paragraph': {
            if (!node.content) return '<p></p>';
            result = `<p>${node.content.map((n) => processTextNode(n as TextNode)).join('')}</p>`;
            break;
          }
          case 'heading': {
            if (!node.content) return '';
            const level = (node.attrs?.level as number) || 1;
            result = `<h${level}>${node.content.map((n) => processTextNode(n as TextNode)).join('')}</h${level}>\n`;
            break;
          }
          case 'bulletList': {
            if (!node.content) return '';
            result = `<ul>${node.content.map((n) => processNode(n as ContentNode)).join('')}</ul>\n`;
            break;
          }
          case 'orderedList': {
            if (!node.content) return '';
            result = `<ol>${node.content.map((n) => processNode(n as ContentNode)).join('')}</ol>\n`;
            break;
          }
          case 'listItem': {
            if (!node.content) return '<li></li>';
            result = `<li>${node.content.map((n) => processNode(n as ContentNode)).join('')}</li>`;
            break;
          }
          case 'taskList': {
            if (!node.content) return '';
            result = `<ul data-type="taskList">${node.content.map((n) => processNode(n as ContentNode)).join('')}</ul>\n`;
            break;
          }
          case 'taskItem': {
            if (!node.content) return '';
            const checked = node.attrs?.checked ? 'checked="checked"' : '';
            result = `<li ${checked ? 'data-checked="true"' : ''}><label><input type="checkbox" ${checked}/></label><div>${node.content.map((n) => processNode(n as ContentNode)).join('')}</div></li>`;
            break;
          }
          case 'codeBlock': {
            if (!node.content) return '';
            const language = node.attrs?.language as string || '';
            result = `<pre><code class="language-${language}">${node.content.map((n) => processTextNode(n as TextNode)).join('')}</code></pre>`;
            break;
          }
          default: {
            if (node.content) {
              result = node.content.map((item) => {
                if ((item as ContentNode).type) {
                  return processNode(item as ContentNode);
                } else {
                  return processTextNode(item as TextNode);
                }
              }).join('');
            }
          }
        }
        
        return result;
      };
      
      const processTextNode = (node: TextNode): string => {
        if (!node.text) return '';
        
        let result = node.text;
        if (node.marks && Array.isArray(node.marks) && node.marks.length > 0) {
          node.marks.forEach((mark) => {
            if (mark.type === 'bold') {
              result = `<strong>${result}</strong>`;
            } else if (mark.type === 'italic') {
              result = `<em>${result}</em>`;
            } else if (mark.type === 'code') {
              result = `<code>${result}</code>`;
            } else if (mark.type === 'link' && mark.attrs?.href) {
              result = `<a href="${mark.attrs.href as string}">${result}</a>`;
            }
          });
        }
        
        return result;
      };
      
      if (content.content) {
        html = content.content.map((node) => processNode(node as ContentNode)).join('');
      }
      
      return html;
    }
  };
};

/**
 * Saves editor content as markdown
 * Works with either a real Tiptap editor or JSON content
 */
export const saveAsMarkdown = async (
  editor: TiptapEditor | TiptapJSON,
  file: {
    name: string;
    path: string;
  },
  saveFileHook: (fileData: { path: string; name: string; content: string | Blob; type?: string; icon?: string }) => Promise<void>
) => {
  let htmlContent: string;
  let jsonContent: TiptapJSON;
  
  // Check if editor is a Tiptap editor instance or JSON content
  if (typeof (editor as TiptapEditor).getHTML === 'function') {
    // It's a Tiptap editor instance
    const tiptapEditor = editor as TiptapEditor;
    htmlContent = tiptapEditor.getHTML();
    jsonContent = tiptapEditor.getJSON();
  } else {
    // It's JSON content, create a renderer
    const renderer = createHtmlRenderer(editor as TiptapJSON);
    htmlContent = renderer.getHTML();
    jsonContent = editor as TiptapJSON;
  }
  
  // Convert HTML to Markdown
  const markdownContent = htmlToMarkdown(htmlContent);
  
  // Call the saveFile hook directly
  console.log(`[saveAsMarkdown] Calling saveFile hook for: ${file.path}`);
  await saveFileHook({
    name: file.name,
    path: file.path,
    content: markdownContent, // Save as Markdown
    // Let the hook determine type and icon if needed
  }).catch(err => {
      console.error(`[saveAsMarkdown] Error calling saveFile hook for ${file.path}:`, err);
      // Optionally re-throw or handle error
  });
  
  // Return JSON content for recovery purposes
  return {
    markdownContent,
    jsonContent
  };
}; 