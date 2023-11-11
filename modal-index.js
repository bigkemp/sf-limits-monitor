var instanceHostname;
var sessionId;
var latestCalloutSuccessful;
if (document.querySelector("body.sfdcBody, body.ApexCSIPage, #auraLoadingBox") || location.host.endsWith("visualforce.com")) {
    chrome.runtime.sendMessage({message: "getSfHost", url: location.href}, sfHost => {
      if (sfHost) {
        getSession(sfHost);
      }
    });
  }

 async function search() {
    let res = await rest("/services/data/v58.0/limits/");
    return res;
 }

  async function getSession(sfHost) {
    let message = await new Promise(resolve =>
      chrome.runtime.sendMessage({message: "getSession", sfHost}, resolve));
    if (message) {
      instanceHostname = message.hostname;
      sessionId = message.key;
    }
  }
  async function rest(url, {logErrors = true, method = "GET", api = "normal", body = undefined, bodyType = "json", headers = {}, progressHandler = null} = {}) {
    latestCalloutSuccessful = false;
    try {
      if (!instanceHostname || !sessionId) {
        throw new Error("Session not found");
      }
  
      let xhr = new XMLHttpRequest();
      url += (url.includes("?") ? "&" : "?") + "cache=" + Math.random();
      xhr.open(method, "https://" + instanceHostname + url, true);
  
      xhr.setRequestHeader("Accept", "application/json; charset=UTF-8");
  
      if (api == "bulk") {
        xhr.setRequestHeader("X-SFDC-Session", sessionId);
      } else if (api == "normal") {
        xhr.setRequestHeader("Authorization", "Bearer " + sessionId);
      } else {
        throw new Error("Unknown api");
      }
  
      if (body !== undefined) {
        if (bodyType == "json") {
          body = JSON.stringify(body);
          xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
        } else if (bodyType == "raw") {
          // Do nothing
        } else {
          throw new Error("Unknown bodyType");
        }
      }
  
      for (let [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
  
      xhr.responseType = "json";
      await new Promise((resolve, reject) => {
        if (progressHandler) {
          progressHandler.abort = () => {
            let err = new Error("The request was aborted.");
            err.name = "AbortError";
            reject(err);
            xhr.abort();
          };
        }
  
        xhr.onreadystatechange = () => {
          if (xhr.readyState == 4) {
            resolve();
          }
        };
        xhr.send(body);
      });
      if (xhr.status >= 200 && xhr.status < 300) {
        latestCalloutSuccessful = true;
        return xhr.response;
      } else if (xhr.status == 0) {
        if (!logErrors) { console.error("Received no response from Salesforce REST API", xhr); }
        let err = new Error();
        err.name = "SalesforceRestError";
        err.message = "Network error, offline or timeout";
        throw err;
      } else {
        if (!logErrors) { console.error("Received error response from Salesforce REST API", xhr); }
        let err = new Error();
        err.name = "SalesforceRestError";
        err.detail = xhr.response;
        try {
          err.message = err.detail.map(err => `${err.errorCode}: ${err.message}${err.fields && err.fields.length > 0 ? ` [${err.fields.join(", ")}]` : ""}`).join("\n");
        } catch (ex) {
          err.message = JSON.stringify(xhr.response);
        }
        if (!err.message) {
          err.message = "HTTP error " + xhr.status + " " + xhr.statusText;
        }
        throw err;
      }
    } catch (error) {
      return error;
    }
    
  }

  chrome.runtime.onMessage.addListener( (message, sender, sendResponse) => {
    console.log('got here',message.type);
    if (message.type === "active") {
      sendResponse("Online");
    }else if(message.type === "search"){
      search().then(sendResponse);
      return true; // return true to indicate you want to send a response asynchronously
    }
  });
  