// Shared markdown conversion utilities

/**
 * Converts HTML content to Markdown
 */
export const htmlToMarkdown = (html: string): string => {
  let markdown = html;
  
  // Convert task lists - needs to happen before regular lists
  markdown = markdown.replace(
    /<ul[^>]*data-type=['"]taskList['"][^>]*>(.*?)<\/ul>/gis,
    (_, listContent) => {
      // Process each task list item
      return listContent.replace(
        /<li[^>]*>(.*?)<\/li>/gis,
        (_liMatch: string, itemContent: string) => {
          // Extract checkbox state
          const checked = itemContent.includes('checked="checked"') || 
                          itemContent.includes('checked="true"') || 
                          itemContent.includes('checked=""');
          
          // Extract the text content
          const textContent = itemContent
            .replace(/<input[^>]*>/gi, '')
            .replace(/<label[^>]*>(.*?)<\/label>/gi, '')
            .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1')
            .replace(/<[^>]+>/g, '');
            
          // Return markdown task item
          const checkboxMark = checked ? '[x]' : '[ ]';
          return `- ${checkboxMark} ${textContent.trim()}\n`;
        }
      );
    }
  );

  // Improved nested lists conversion with DOM parsing
  const convertNestedLists = (htmlContent: string): string => {
    // Create a temporary container to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const container = doc.body.firstChild as HTMLElement;
    
    // Function to process a list and its nested lists recursively
    const processList = (list: HTMLElement, indent: number = 0): string => {
      let result = '';
      const isOrdered = list.tagName.toLowerCase() === 'ol';
      let itemCounter = 1;
      
      // Skip task lists as they're handled separately
      if (list.getAttribute('data-type') === 'taskList') {
        return '';
      }
      
      // Process each list item
      Array.from(list.children).forEach((item) => {
        if (item.tagName.toLowerCase() !== 'li') return;
        
        const indentation = '  '.repeat(indent);
        const itemPrefix = isOrdered ? `${itemCounter}. ` : '- ';
        
        // Get text content of the list item, excluding nested lists
        let textContent = '';
        const nestedLists: HTMLElement[] = [];
        
        Array.from(item.childNodes).forEach((child) => {
          const nodeName = child.nodeName.toLowerCase();
          
          if (nodeName === 'ul' || nodeName === 'ol') {
            nestedLists.push(child as HTMLElement);
          } else if (nodeName === '#text') {
            textContent += child.textContent || '';
          } else if (nodeName === 'p' || nodeName === 'div' || nodeName === 'span') {
            // Extract text from paragraphs and divs, but not from nested lists
            let hasNestedList = false;
            Array.from(child.childNodes).forEach((grandchild) => {
              const grandchildName = grandchild.nodeName.toLowerCase();
              if (grandchildName === 'ul' || grandchildName === 'ol') {
                nestedLists.push(grandchild as HTMLElement);
                hasNestedList = true;
              }
            });
            
            if (!hasNestedList) {
              textContent += child.textContent || '';
            } else {
              // If there are nested lists, extract only the direct text content
              Array.from(child.childNodes).forEach((grandchild) => {
                if (grandchild.nodeType === 3) { // Text node
                  textContent += grandchild.textContent || '';
                } else if (grandchild.nodeName.toLowerCase() !== 'ul' && 
                          grandchild.nodeName.toLowerCase() !== 'ol') {
                  textContent += grandchild.textContent || '';
                }
              });
            }
          } else {
            textContent += child.textContent || '';
          }
        });
        
        // Add the list item text
        result += `${indentation}${itemPrefix}${textContent.trim()}\n`;
        
        // Process nested lists
        nestedLists.forEach((nestedList) => {
          result += processList(nestedList, indent + 1);
        });
        
        if (isOrdered) itemCounter++;
      });
      
      return result;
    };
    
    // Find and process all top-level lists
    let output = htmlContent;
    const topLevelLists = container.querySelectorAll(':scope > ul, :scope > ol');
    
    topLevelLists.forEach((list) => {
      const listHtml = list.outerHTML;
      const listMarkdown = processList(list as HTMLElement);
      
      // Replace the list HTML with its markdown equivalent
      output = output.replace(listHtml, listMarkdown);
    });
    
    return output;
  };
  
  // Check if we're running in a browser environment with DOM available
  if (typeof DOMParser !== 'undefined') {
    // Apply the improved nested list conversion
    markdown = convertNestedLists(markdown);
  } else {
    // Fallback for non-browser environments (like Node.js)
    console.warn("DOMParser not available. Using regex-based list conversion instead.");
    
    // Process top-level unordered lists
    markdown = markdown.replace(
      /<ul(?![^>]*data-type=['"]taskList['"])[^>]*>([\s\S]*?)<\/ul>/gi,
      (_, content: string) => {
        return content.replace(
          /<li[^>]*>([\s\S]*?)<\/li>/gi,
          (_: string, itemContent: string) => {
            // Extract text (exclude nested lists)
            const text = itemContent
              .replace(/<ul[\s\S]*?<\/ul>/gi, '')
              .replace(/<ol[\s\S]*?<\/ol>/gi, '')
              .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
              .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .trim();
            
            // Find and process nested lists with indentation
            const nestedLists = itemContent.match(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi) || [];
            
            let result = `- ${text}\n`;
            
            nestedLists.forEach((nestedList: string) => {
              // Indent nested lists
              const isOrdered = nestedList.startsWith('<ol');
              
              const nestedItems = nestedList.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
              nestedItems.forEach((nestedItem: string, index: number) => {
                const nestedText = nestedItem
                  .replace(/<ul[\s\S]*?<\/ul>/gi, '')
                  .replace(/<ol[\s\S]*?<\/ol>/gi, '')
                  .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
                  .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
                  .replace(/<[^>]+>/g, '')
                  .trim();
                
                const prefix = isOrdered ? `${index + 1}. ` : '- ';
                result += `  ${prefix}${nestedText}\n`;
              });
            });
            
            return result;
          }
        );
      }
    );
    
    // Process top-level ordered lists
    markdown = markdown.replace(
      /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
      (_, content: string) => {
        let itemIndex = 1;
        return content.replace(
          /<li[^>]*>([\s\S]*?)<\/li>/gi,
          (_: string, itemContent: string) => {
            // Extract text (exclude nested lists)
            const text = itemContent
              .replace(/<ul[\s\S]*?<\/ul>/gi, '')
              .replace(/<ol[\s\S]*?<\/ol>/gi, '')
              .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
              .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .trim();
            
            // Find and process nested lists with indentation
            const nestedLists = itemContent.match(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi) || [];
            
            let result = `${itemIndex}. ${text}\n`;
            itemIndex++;
            
            nestedLists.forEach((nestedList: string) => {
              // Indent nested lists
              const isOrdered = nestedList.startsWith('<ol');
              
              const nestedItems = nestedList.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
              nestedItems.forEach((nestedItem: string, index: number) => {
                const nestedText = nestedItem
                  .replace(/<ul[\s\S]*?<\/ul>/gi, '')
                  .replace(/<ol[\s\S]*?<\/ol>/gi, '')
                  .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
                  .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
                  .replace(/<[^>]+>/g, '')
                  .trim();
                
                const prefix = isOrdered ? `${index + 1}. ` : '- ';
                result += `  ${prefix}${nestedText}\n`;
              });
            });
            
            return result;
          }
        );
      }
    );
  }

  // Convert tables
  markdown = markdown.replace(
    /<table[^>]*>(.*?)<\/table>/gis,
    (_, tableContent) => {
      const rows = tableContent.match(/<tr[^>]*>.*?<\/tr>/gis) || [];
      if (rows.length === 0) return "";

      const markdownRows = rows.map((row: string) => {
        const cells = row.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi) || [];
        return (
          "| " +
          cells
            .map((cell: string) => {
              return cell
                .replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/i, "$1")
                .replace(/<br[^>]*>/gi, " ")
                .replace(/<\/?p[^>]*>/gi, "")
                .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, "**$1**")
                .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, "*$1*")
                .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
                .replace(
                  /<a[^>]*href=['"]([^'"]+)['"][^>]*>(.*?)<\/a>/gi,
                  "[$2]($1)"
                )
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/\s*\n\s*/g, " ")
                .trim()
                .replace(/\|/g, "\\|");
            })
            .join(" | ") +
          " |"
        );
      });

      // Insert header separator after first row
      if (markdownRows.length > 0) {
        const columnCount =
          rows[0].match(/<t[dh][^>]*>.*?<\/t[dh]>/gis)?.length || 0;
        const separator = "|" + " --- |".repeat(columnCount);
        markdownRows.splice(1, 0, separator);
      }

      return "\n" + markdownRows.join("\n") + "\n";
    }
  );

  // Convert code blocks
  markdown = markdown.replace(
    /<pre[^>]*><code[^>]*(?:class="language-([^"]+)")?[^>]*>(.*?)<\/code><\/pre>/gis,
    (_, language, code) => {
      const lang = language || "";
      return `\n\`\`\`${lang}\n${code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")}\n\`\`\`\n`;
    }
  );

  // Convert inline code
  markdown = markdown.replace(
    /<code[^>]*>(.*?)<\/code>/gi,
    (_, code) =>
      `\`${code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")}\``
  );

  // Convert headings
  markdown = markdown
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
  
  // Convert text formatting
  markdown = markdown
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "_$1_");

  // Convert paragraphs and line breaks
  markdown = markdown
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n")
    .replace(/<br[^>]*>/gi, "\n");

  // Remove any remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, "");

  // Fix HTML entities
  markdown = markdown
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Normalize multiple newlines and trim
  markdown = markdown
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return markdown;
};

/**
 * Converts Markdown to HTML
 */
export const markdownToHtml = (markdown: string): string => {
  let html = markdown;

  // Process task lists first
  html = html.replace(/^(\s*)-\s+\[([ xX])\]\s+(.*?)$/gm, (_, indent, checked, text) => {
    const isChecked = checked.toLowerCase() === 'x';
    const indentSpaces = indent ? indent.length : 0;
    const indentClass = indentSpaces > 0 ? ` class="indented" style="margin-left:${indentSpaces * 10}px"` : '';
    return `<ul data-type="taskList"${indentClass}><li${isChecked ? ' data-checked="true"' : ''}><label><input type="checkbox" ${isChecked ? 'checked' : ''}/></label><div><p>${text}</p></div></li></ul>`;
  });

  // Process indented lists with proper nesting
  const processIndentedLists = () => {
    // Track list processing state
    const listStack: { type: string; indent: number; html: string }[] = [];
    const lines = html.split('\n');
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for bullet list item (allow more flexible indentation with spaces or tabs)
      const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*?)$/);
      if (bulletMatch) {
        const [, indent, , content] = bulletMatch; // Ignore bullet character
        const indentLevel = indent ? Math.ceil(indent.length / 2) : 0;
        
        // Check if we need to close any lists or start a new one
        while (listStack.length > 0 && 
              (listStack[listStack.length - 1].indent > indentLevel || 
              (listStack[listStack.length - 1].indent === indentLevel && listStack[listStack.length - 1].type !== 'ul'))) {
          const closedList = listStack.pop();
          if (closedList) {
            processedLines.push(`</${closedList.type}>`);
          }
        }
        
        // Start a new list if needed
        if (listStack.length === 0 || listStack[listStack.length - 1].indent < indentLevel) {
          processedLines.push(`<ul${indentLevel > 0 ? ` style="margin-left:${indentLevel * 20}px"` : ''}>`);
          listStack.push({ type: 'ul', indent: indentLevel, html: '<ul>' });
        }
        
        // Add the list item
        processedLines.push(`<li>${content}</li>`);
        continue;
      }
      
      // Check for ordered list item (allow more flexible indentation)
      const orderedMatch = line.match(/^(\s*)(\d+)[.)] (.*?)$/);
      if (orderedMatch) {
        const [, indent, , content] = orderedMatch; // Ignore number
        const indentLevel = indent ? Math.ceil(indent.length / 2) : 0;
        
        // Check if we need to close any lists or start a new one
        while (listStack.length > 0 && 
              (listStack[listStack.length - 1].indent > indentLevel || 
              (listStack[listStack.length - 1].indent === indentLevel && listStack[listStack.length - 1].type !== 'ol'))) {
          const closedList = listStack.pop();
          if (closedList) {
            processedLines.push(`</${closedList.type}>`);
          }
        }
        
        // Start a new list if needed
        if (listStack.length === 0 || listStack[listStack.length - 1].indent < indentLevel) {
          processedLines.push(`<ol${indentLevel > 0 ? ` style="margin-left:${indentLevel * 20}px"` : ''}>`);
          listStack.push({ type: 'ol', indent: indentLevel, html: '<ol>' });
        }
        
        // Add the list item
        processedLines.push(`<li>${content}</li>`);
        continue;
      }
      
      // If it's not a list item, close all open lists
      if (listStack.length > 0) {
        for (let j = listStack.length - 1; j >= 0; j--) {
          processedLines.push(`</${listStack[j].type}>`);
        }
        listStack.length = 0;
      }
      
      // Add the non-list line
      processedLines.push(line);
    }
    
    // Close any remaining open lists
    for (let i = listStack.length - 1; i >= 0; i--) {
      processedLines.push(`</${listStack[i].type}>`);
    }
    
    return processedLines.join('\n');
  };
  
  // Apply indented list processing
  html = processIndentedLists();

  // Convert headings
  html = html.replace(/^### (.*$)(\n)?/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)(\n)?/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)(\n)?/gm, "<h1>$1</h1>");

  // Convert bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<u>$1</u>");

  // Convert code blocks
  html = html.replace(/```([^`]*?)```/gs, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Convert paragraphs (lines not starting with special characters)
  html = html.replace(/^(?![#<*_\s*-+\d.])(.*$)/gm, "<p>$1</p>");

  // Clean up empty paragraphs and normalize whitespace
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.trim();

  return html;
};

/**
 * Converts HTML content to plain text
 */
export const htmlToPlainText = (html: string): string => {
  return html
    .replace(/<[^>]+>/g, "") // Remove all HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/\n\n+/g, "\n\n")
    .trim();
}; 