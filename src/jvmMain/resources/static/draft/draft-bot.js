/** Draft Battle's bot thinks here, off the page's thread: a pick tries several battles. */
importScripts(`draft-engine.js${self.location.search}`);

self.onmessage = (e) => {
    const {id, args} = e.data;
    self.postMessage({id, choice: self.DraftEngine.botChoice(...args)});
};
