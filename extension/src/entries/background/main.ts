import browser from "webextension-polyfill";

type Message = {
  id: string;
  payload?: {
    command: string;
    [key: string]: any;
  };
  error?: string;
};

// activate when installed or updated
browser.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated");
});

// activate when browser starts
browser.runtime.onStartup.addListener(() => {
  console.log("Browser started");
});

browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === "popup") {
    console.log("Popup opened");
  }
});

const port = browser.runtime.connectNative("com.pomdtr.webterm");
port.onMessage.addListener(async (msg: Message) => {
  console.log("Received message", msg);
  try {
    const res = await handleMessage(msg.payload);
    port.postMessage({
      id: msg.id,
      payload: res,
    });
  } catch (e: any) {
    port.postMessage({
      id: msg.id,
      error: e.message,
    });
  }
});

async function handleMessage(payload: any): Promise<any> {
  switch (payload.command) {
    case "tab.list": {
      return await browser.tabs.query({ currentWindow: true });
    }
    case "tab.get": {
      let { tabId } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }
      return await browser.tabs.get(tabId);
    }
    case "tab.pin": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }

      for (const tabId of tabIds) {
        await browser.tabs.update(tabId, { pinned: true });
      }

      return;
    }
    case "tab.unpin": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }

      for (const tabId of tabIds) {
        await browser.tabs.update(tabId, { pinned: false });
      }

      return;
    }
    case "tab.focus": {
      const { tabId } = payload;
      const tab = await browser.tabs.update(tabId, { active: true });
      if (tab.windowId !== undefined) {
        await browser.windows.update(tab.windowId, { focused: true });
      }
      return;
    }
    case "tab.remove": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }
      await browser.tabs.remove(tabIds);
      return;
    }
    case "tab.reload": {
      let { tabIds } = payload;
      if (tabIds === undefined) {
        tabIds = [await getActiveTabId()];
      }
      for (const tabId of tabIds) {
        await browser.tabs.reload(tabId);
      }
      return;
    }
    case "tab.update": {
      const { tabId, url } = payload;
      await browser.tabs.update(tabId, { url });
      return;
    }
    case "tab.create": {
      const { urls } = payload;
      const currentWindow = await browser.windows.getCurrent();
      if (currentWindow.id === undefined) {
        throw new Error("Current window not found");
      }

      for (const url of urls) {
        await browser.tabs.create({ url, windowId: currentWindow.id });
      }

      await browser.windows.update(currentWindow.id, { focused: true });
      return;
    }
    case "tab.source": {
      let { tabId } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }

      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return document.documentElement.outerHTML;
        },
      });

      return res[0].result;
    }
    case "selection.get": {
      let { tabId } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }

      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return window.getSelection()?.toString() || "";
        },
      });

      return res[0].result;
    }
    case "selection.set": {
      let { tabId, text } = payload;
      if (tabId === undefined) {
        tabId = await getActiveTabId();
      }

      console.log(`setting input to ${text}`);
      await chrome.scripting.executeScript({
        target: { tabId },
        args: [text],
        func: (text) => {
          // Get the current selection
          const selection = window.getSelection();
          if (!selection) {
            return;
          }

          if (selection.rangeCount > 0) {
            // Get the first range of the selection
            const range = selection.getRangeAt(0);

            // Create a new text node as replacement
            const newNode = document.createTextNode(text);

            // Replace the selected range with the new node
            range.deleteContents();
            range.insertNode(newNode);

            // Adjust the selection to the end of the inserted node
            range.collapse(false);

            // Clear any existing selection
            selection.removeAllRanges();

            // Add the modified range to the selection
            selection.addRange(range);
          }
        },
      });

      return;
    }
    case "window.list": {
      return browser.windows.getAll({});
    }
    case "window.focus": {
      const { windowId } = payload;
      return await browser.windows.update(windowId, {
        focused: true,
      });
    }
    case "window.remove": {
      const { windowId } = payload;
      await browser.windows.remove(windowId);
      return;
    }
    case "window.create": {
      const { url } = payload;
      return await browser.windows.create({ url });
    }
    case "extension.list": {
      return await browser.management.getAll();
    }
    case "bookmark.list": {
      return await browser.bookmarks.getTree();
    }
    case "bookmark.create": {
      const { parentId, title, url } = payload;
      return browser.bookmarks.create({
        parentId,
        title,
        url,
      });
    }
    case "bookmark.remove": {
      const { id } = payload;
      browser.bookmarks.remove(id);
      return;
    }
    case "download.list": {
      return await browser.downloads.search({});
    }
    case "history.search": {
      return browser.history.search({ text: payload.query });
    }
    default: {
      throw new Error(`Unknown command: ${payload.command}`);
    }
  }
}

async function getActiveTabId() {
  const activeTabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tabId = activeTabs[0].id;
  if (tabId === undefined) {
    throw new Error("Active tab not found");
  }
  return tabId;
}
