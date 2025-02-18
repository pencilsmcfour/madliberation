#!/usr/bin/env node

const puppeteer = require("puppeteer");
const commander = require("commander");
const crypto = require("crypto");

commander
  .version("3.0.0")
  .option(
    "-s, --site <URL>",
    "Site to run against, default https://passover.lol"
  )
  .option("-L, --slow", "Run headfully in slow mode")
  .option("-I, --idp-url <URL>", "The URL expected after clicking 'Log in'")
  .option("--user-pool-id <ID>", "The User Pool Id for the web app")
  .option(
    "--setup-only",
    "Create a User Pool user and exit, do not launch a browser"
  )
  .parse(process.argv);
const slowDown = 200;
const timeoutMs = 45000 + (commander.opts().slow ? slowDown + 2000 : 0);
const defaultUrl = "https://passover.lol";
const site = commander.opts().site || defaultUrl;
const idpUrl = commander.opts().idpUrl;
const userPoolId = commander.opts().userPoolId;
const setupOnly = commander.opts().setupOnly;
const browserOptions = {
  headless: commander.opts().slow ? false : true,
  args: ["--no-sandbox"],
};
browserOptions.slowMo = slowDown;

const failTest = async (err, msg, browser) => {
  console.log("test failed: " + msg);
  console.log(err);
  if (browser) await browser.close();
  process.exit(1);
};

const waitOptions = { timeout: timeoutMs /*, visible: true*/ };
const waitForNavigationOptions = { timeout: timeoutMs };
const clickOptions = { delay: 200 };
const typeOptions = { delay: 90 };
const itWait = async ({ page, madliberationid }) => {
  await page
    .waitForSelector(`[madliberationid="${madliberationid}"]`, waitOptions)
    .catch(async (e) => {
      failTest(e, `Could not find ${madliberationid}`);
    });
};
const itWaitForAttribute = async (page, attribute) => {
  await page.waitForSelector(`[${attribute}]`, waitOptions).catch(async (e) => {
    failTest(e, `Could not find attribute ${attribute}`);
  });
};
const itClick = async ({ page, madliberationid }) => {
  await itWait({ page: page, madliberationid: madliberationid });
  await page
    .click(`[madliberationid="${madliberationid}"]`, clickOptions)
    .catch(async (e) => {
      failTest(e, `Could not click ${madliberationid}`);
    });
};
const itType = async ({ page, madliberationid, text }) => {
  await itClick({ page: page, madliberationid: madliberationid });
  await page
    .type(`[madliberationid="${madliberationid}"]`, text, typeOptions)
    .catch(async (e) => {
      failTest(e, `Could not type into ${madliberationid}`);
    });
};
const assertOnUrl = ({ page, expectedUrl }) => {
  if (expectedUrl !== page.url()) {
    failTest(
      "unexpected URL",
      `expected URL to be ${expectedUrl}` +
        ` after navigation, got ${page.url()}`
    );
  }
};
const itNavigate = async ({ page, madliberationid, expectedLandingPage }) => {
  await itWait({ page: page, madliberationid: madliberationid });
  await Promise.all([
    page.click(`[madliberationid="${madliberationid}"]`, clickOptions),
    page.waitForNavigation(waitForNavigationOptions),
  ]).catch(async (e) => {
    failTest(e, `Could not navigate by clicking on ${madliberationid}`);
  });
  if (expectedLandingPage) {
    assertOnUrl({ page, expectedUrl: expectedLandingPage });
  }
};
const itGetText = async ({ page, madliberationid }) => {
  await itWait({ page: page, madliberationid: madliberationid });
  const text = await page
    .$$(`[madliberationid="${madliberationid}"]`)
    .then((a) => {
      if (!Array.isArray(a) || a.length < 1) {
        throw new Error(`Could not get text from ${madliberationid}`);
      }
      return a[0].getProperty("textContent");
    })
    .then((textContent) => {
      return textContent.jsonValue();
    })
    .catch(async (e) => {
      failTest(e, `Failed getting text content of ${madliberationid}`);
    });
  return text;
};
const itGetGroupText = async (page, containerMLId, groupName) => {
  await itWait({ page: page, madliberationid: containerMLId }).catch(
    async (e) => {
      failTest(e, `Failed to find container ${containerMLId}`);
    }
  );
  const container = await page
    .$(`[madliberationid="${containerMLId}"]`)
    .catch(async (e) => {
      failTest(e, `Failed to get container ${containerMLId}`);
    });
  const texts = await container
    .$$eval(`[${groupName}]`, (nodes) => nodes.map((n) => n.innerText))
    .catch(async (e) => {
      failTest(e, `Failed to get group ${groupName}`);
    });
  return texts;
};
const itGetArrayByAttribute = async (page, attribute) => {
  const handles = await page.$$(`[${attribute}]`).catch(async (e) => {
    failTest(e, `Failed getting array of elements with attribute ${attribute}`);
  });
  return handles;
};

const submitAllLibs = async (page, prefix) => {
  const answers = [];
  const progressText = await itGetText({
    page: page,
    madliberationid: "lib-progress",
  });
  const progress = progressText.split("/").map((n) => parseInt(n.trim()));
  if (progress.length < 2) {
    failTest("/play page", "did not find X / Y showing lib progress");
  }
  const numLibs = progress[1];
  for (let currentLib = progress[0]; currentLib <= numLibs; currentLib++) {
    // Enter a lib, save it to answers
    const ans = `${prefix}${currentLib}`;
    await itType({
      page: page,
      madliberationid: `answer-${currentLib - 1}`,
      text: ans,
    });
    answers.push(ans);
    // If we're on the last lib, submit and return
    if (currentLib === numLibs) {
      await itClick({ page: page, madliberationid: "submit-answers" });
      await itNavigate({
        page: page,
        madliberationid: "yes-submit-libs-button",
      });
      return answers;
    }
    // Click the Next button
    await itClick({ page: page, madliberationid: "next-prompt" });
  }
  failTest("/play page", "never found a Submit Answers button");
};

const submitNoLibs = async (page) => {
  const progressText = await itGetText({
    page: page,
    madliberationid: "lib-progress",
  });
  const progress = progressText.split("/").map((n) => parseInt(n.trim()));
  if (progress.length < 2) {
    failTest("/play page", "did not find X / Y showing lib progress");
  }
  const numLibs = progress[1];
  for (let currentLib = progress[0]; currentLib <= numLibs; currentLib++) {
    // If we're on the last lib, submit and return
    if (currentLib === numLibs) {
      await itClick({ page: page, madliberationid: "submit-answers" });
      await itNavigate({
        page: page,
        madliberationid: "yes-submit-libs-button",
      });
      return;
    }
    // Click the Next button
    await itClick({ page: page, madliberationid: "next-prompt" });
  }
  failTest("/play page", "never found a Submit Answers button");
};

(async () => {
  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Setup
  // prereq: for generating random user credentials
  // Set up test user
  const randString = (options) => {
    const { numLetters } = options;
    const alphabet = (
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "abcdefghijklmnopqrstuvwxyz"
    ).split("");
    let str = "";
    for (let i = 0; i < numLetters; i++) {
      str =
        str +
        alphabet[
          parseInt(crypto.randomBytes(3).toString("hex"), 16) % alphabet.length
        ];
    }
    return str;
  };

  const AWS = require("aws-sdk");
  const createUser = async (userName, tempPassword) => {
    const cognitoidentityserviceprovider =
      new AWS.CognitoIdentityServiceProvider({
        apiVersion: "2016-04-18",
      });
    const adminCreateUserParams = {
      UserPoolId: userPoolId,
      Username: userName,
      MessageAction: "SUPPRESS",
      TemporaryPassword: tempPassword,
      UserAttributes: [{ Name: "nickname", Value: `nn-${userName}` }],
      ValidationData: [
        {
          Name: "email_verified",
          Value: "True",
        },
      ],
    };
    const createUserResponse = await new Promise((resolve, reject) => {
      cognitoidentityserviceprovider.adminCreateUser(
        adminCreateUserParams,
        (err, data) => {
          resolve({ err, data });
        }
      );
    });
    if (createUserResponse.err) {
      failTest(createUserResponse.err, "Failed to create a user in setup");
    }
    console.log(
      `created user with username ${userName}` +
        (setupOnly ? ` and temp password ${tempPassword}` : "")
    );
  };
  const user2NameLength = 8;
  const user2Name =
    randString({ numLetters: user2NameLength }) + "@example.com";
  const user2TempPasswordLength = 10;
  const user2TempPassword = randString({ numLetters: user2TempPasswordLength });
  const user2PasswordLength = 8;
  const user2Password = randString({ numLetters: user2PasswordLength });

  await createUser(user2Name, user2TempPassword);
  if (setupOnly) {
    console.log("--setup-only supplied, exiting");
    process.exit(0);
  }

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Actual test

  const browsers = []; // so we can close them all when failing a test, someday
  const browser = await puppeteer.launch(browserOptions);
  browsers.push(browser);
  const page = await browser.newPage();
  await page.goto(site);

  ////////////////////////////////////////////////////////////////////////////////
  // Home Page
  await page
    .waitForXPath('//*[text()="Join a seder"]', waitOptions)
    .catch(async (e) => {
      failTest(e, "Join a seder button not found", browser);
    });

  // Explain Page
  await itNavigate({
    page: page,
    madliberationid: "lead-a-seder-by-video-button",
  });

  ////////////////////////////////////////////////////////////////////////////////

  await itWait({ page: page, madliberationid: "explain-page" });
  await itClick({ page: page, madliberationid: "app-bar-menu-icon-button" });
  await itNavigate({ page: page, madliberationid: "menu-about-link" });

  ////////////////////////////////////////////////////////////////////////////////
  // Confirm the About page is displayed
  await itWait({ page: page, madliberationid: "about-page" });

  // How to Play Page from menu button
  await itClick({ page: page, madliberationid: "app-bar-menu-icon-button" });
  await itNavigate({ page: page, madliberationid: "menu-how-to-play-link" });

  ////////////////////////////////////////////////////////////////////////////////
  // Confirm the How to Play page is displayed
  await itWait({ page: page, madliberationid: "how-to-play-page" });
  // Confirm that the location has the expected hash
  assertOnUrl({ page, expectedUrl: `${site}/#/how-to-play` });

  // Go back to the Home Page
  await itClick({ page: page, madliberationid: "app-bar-menu-icon-button" });
  await itNavigate({ page: page, madliberationid: "menu-home-link" });

  ////////////////////////////////////////////////////////////////////////////////

  // Lead a seder
  await itNavigate({
    page: page,
    madliberationid: "lead-a-seder-by-video-button",
  });

  ////////////////////////////////////////////////////////////////////////////////

  await itWait({ page: page, madliberationid: "explain-page" });
  await itNavigate({
    page: page,
    madliberationid: "proceed-from-explanation-button",
  });

  ////////////////////////////////////////////////////////////////////////////////

  await itWait({ page: page, madliberationid: "pick-your-script-page" });

  // Pick the Practice Script
  await itClick({ page: page, madliberationid: "Practice Script" });
  await itNavigate({ page: page, madliberationid: "pick-this-script-button" });

  ////////////////////////////////////////////////////////////////////////////////
  // Wait for a Room Code to appear
  await itWait({ page: page, madliberationid: "your-room-code" });
  const roomCode = await itGetText({
    page: page,
    madliberationid: "your-room-code",
  });
  // Got the Room Code, enter the leader's Game Name
  const leaderName = `Le`;
  await itType({
    page: page,
    madliberationid: "ringleader-game-name-text-field",
    text: leaderName,
  });
  // Submit leader Game Name
  await itNavigate({ page: page, madliberationid: "thats-my-name-button" });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  // Add a second player, who will log in
  const browser2 = await puppeteer.launch(browserOptions);
  browsers.push(browser2);
  const page2 = await browser2.newPage();
  await page2.goto(site);
  // Player 2
  await itNavigate({ page: page2, madliberationid: "login-button" });
  assertOnUrl({ page: page2, expectedUrl: idpUrl });

  // Enter username
  const usernameSelector = `input#signInFormUsername[type='text']`;
  const enterUserName = async ({ browser, page, userName }) => {
    await page
      .waitForSelector(usernameSelector, {
        ...waitOptions,
        visible: true,
      })
      .catch(async (e) => {
        failTest(e, `Could not find username input`, browser);
      });
    await page
      .click(usernameSelector, {
        ...clickOptions,
        visible: true,
      })
      .catch(async (e) => {
        failTest(e, `Could not click username input`, browser);
      });
    await page
      .type(usernameSelector, userName, {
        ...typeOptions,
        visible: true,
      })
      .catch(async (e) => {
        failTest(e, `Could not enter username`, browser);
      });
  };
  await enterUserName({ browser: browser2, page: page2, userName: user2Name });

  // Enter temp password
  const passwordSelector = `input#signInFormPassword[type='password']`;
  await page2
    .waitForSelector(passwordSelector, {
      ...waitOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not find password input`, browser2);
    });
  await page2
    .click(passwordSelector, {
      ...clickOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not click password input`, browser2);
    });
  await page2
    .type(passwordSelector, user2TempPassword, {
      ...typeOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not enter password`, browser2);
    });

  // Click Sign In
  const submitButtonSelector = `input[name='signInSubmitButton'][type='Submit']`;
  await page2
    .waitForSelector(submitButtonSelector, {
      ...waitOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not find submit button`, browser2);
    });
  await page2
    .click(submitButtonSelector, {
      ...clickOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not click submit button`, browser2);
    });

  // Reset the password
  const newPasswordSelector = `input#new_password[type='password']`;
  await page2
    .waitForSelector(newPasswordSelector, {
      ...waitOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not find new password input`, browser2);
    });
  await page2
    .click(newPasswordSelector, {
      ...clickOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not click new password input`, browser2);
    });
  await page2
    .type(newPasswordSelector, user2Password, {
      ...typeOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not enter new password`, browser2);
    });
  const confirmPasswordSelector = `input#confirm_password[type='password']`;
  await page2
    .click(confirmPasswordSelector, {
      ...clickOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not click confirm password input`, browser2);
    });
  await page2
    .type(confirmPasswordSelector, user2Password, {
      ...typeOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not re-enter new password`, browser2);
    });
  const sendButtonSelector = `button[name="reset_password"][type='submit']`;
  await page2
    .click(sendButtonSelector, {
      ...clickOptions,
      visible: true,
    })
    .catch(async (e) => {
      failTest(e, `Could not submit password change`, browser2);
    });

  // Click Lead a Seder button, and get a room code. We will bail out of this
  // seder and join the one the other player already started, as part of
  // validating the re-join flow.
  await itNavigate({
    page: page2,
    madliberationid: "lead-a-seder-in-person-button",
  });
  await itNavigate({
    page: page2,
    madliberationid: "proceed-from-explanation-button",
  });
  await itWait({ page: page2, madliberationid: "pick-your-script-page" });
  await itClick({ page: page2, madliberationid: "Practice Script" });
  await itNavigate({ page: page2, madliberationid: "pick-this-script-button" });
  await itWait({ page: page2, madliberationid: "your-room-code" });
  const abandonedSederRoomCode = await itGetText({
    page: page2,
    madliberationid: "your-room-code",
  });
  await page2.goto(site);

  // Click Join a Seder button
  await itNavigate({ page: page2, madliberationid: "join-a-seder-button" });

  ////////////////////////////////////////////////////////////////////////////////

  await itWait({ page: page2, madliberationid: "enter-room-code-page" });

  // Enter Room Code and Game Name
  const player2Name = `P2`;
  await itType({
    page: page2,
    madliberationid: "enter-room-code-text-field",
    text: roomCode,
  });
  await itType({
    page: page2,
    madliberationid: "game-name-text-field",
    text: player2Name,
  });
  await itNavigate({ page: page2, madliberationid: "join-this-seder-button" });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  // Leader checks roster
  // Check to make sure WebSockets work for the roster
  await itGetText({
    page: page,
    madliberationid: "pc1",
  });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Enter Player 3. Player 3 is needed so that one participant can validate Web
  // Socket flows, starting with /ws-wait, while another validates the non-Web
  // Socket options still work.
  const browser3 = await puppeteer.launch(browserOptions);
  browsers.push(browser3);
  const page3 = await browser3.newPage();
  await page3.goto(site);
  await itNavigate({ page: page3, madliberationid: "join-a-seder-button" });
  ////////////////////////////////////////////////////////////////////////////////
  await itWait({ page: page3, madliberationid: "enter-room-code-page" });
  const player3Name = "P3";
  await itType({
    page: page3,
    madliberationid: "enter-room-code-text-field",
    text: roomCode,
  });
  await itType({
    page: page3,
    madliberationid: "game-name-text-field",
    text: player2Name, // so we can test the name-taken flow
  });
  await itClick({ page: page3, madliberationid: "join-this-seder-button" });
  await itWait({ page: page3, madliberationid: "name-taken-message" });
  await itClick({ page: page3, madliberationid: "game-name-text-field" });
  await page3.keyboard.press("Backspace");
  await page3.keyboard.press("Backspace");
  await itType({
    page: page3,
    madliberationid: "game-name-text-field",
    text: player3Name,
  });
  await itNavigate({ page: page3, madliberationid: "join-this-seder-button" });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  // Click No, Check Again. Players 1, 2, and 3 should be there
  await itClick({ page: page, madliberationid: "no-check-again-button" });
  // Verify all players are on the roster
  const leaderNameFromTable = await itGetText({
    page: page,
    madliberationid: "pc0",
  });
  if (leaderNameFromTable != leaderName) {
    failTest(
      "wrong name on roster",
      `expected ${leaderName}, got ` + `${leaderNameFromTable}`
    );
  }
  const p2NameFromTable = await itGetText({
    page: page,
    madliberationid: "pc1",
  });
  if (p2NameFromTable != player2Name) {
    failTest(
      "wrong name on roster",
      `expected ${player2Name}, got ` + `${p2NameFromTable}`
    );
  }
  const p3NameFromTable = await itGetText({
    page: page,
    madliberationid: "pc2",
  });
  if (p3NameFromTable != player3Name) {
    failTest(
      "wrong name on roster",
      `expected ${player3Name}, got ` + `${p3NameFromTable}`
    );
  }

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // P3: Click the button to get to /fetching-prompts
  await itNavigate({
    page: page3,
    madliberationid: "player-click-this-button",
    expectedLandingPage: `${site}/#/fetching-prompts`,
  });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Leader
  // Click Thats Everyone
  await itClick({ page: page, madliberationid: "thats-everyone-button" });
  // Confirm
  await itNavigate({
    page: page,
    madliberationid: "confirm-thats-everyone-button",
  });

  ////////////////////////////////////////////////////////////////////////////////

  // Leader: get assignments, complete them, and submit
  await itNavigate({ page: page, madliberationid: "leader-click-this-button" });

  ////////////////////////////////////////////////////////////////////////////////

  // Make sure we're on the /play page
  await itWait({ page: page, madliberationid: "lib-progress" });
  const leaderAnswers = await submitAllLibs(page, "le");

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  // Player 2: get assignments, complete them, and submit
  // state change should be pushed to take us off the Wait page

  ////////////////////////////////////////////////////////////////////////////////

  // Make sure we're on the /play page
  await itWait({ page: page2, madliberationid: "lib-progress" });
  const p2Answers = await submitAllLibs(page2, "p2");

  ////////////////////////////////////////////////////////////////////////////////

  // Player 2: not going to read the script
  await itNavigate({
    page: page2,
    madliberationid: "use-someone-elses-device-button",
  });

  ////////////////////////////////////////////////////////////////////////////////

  await itWait({ page: page2, madliberationid: "done-not-reading-page" });

  // Actually, they are, so we can test refresh on the read roster
  await itNavigate({
    page: page2,
    madliberationid: "wait-maybe-i-do-button",
  });
  await itNavigate({
    page: page2,
    madliberationid: "i-want-the-script-button",
  });
  await itWait({
    page: page2,
    madliberationid: "read-roster-check-again-button",
  });
  await page2.reload();
  await itWait({
    page: page2,
    madliberationid: "read-roster-check-again-button",
  });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Leader

  await itNavigate({ page: page, madliberationid: "i-want-the-script-button" });
  // leader and p2 should show as submitted, p3 should show as un-submitted
  await itClick({
    page: page,
    madliberationid: "read-roster-check-again-button",
  });
  await itWait({ page: page, madliberationid: "doneCell0" });
  await itWait({ page: page, madliberationid: "doneCell1" });
  await itWait({ page: page, madliberationid: "notDoneCell0" });

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // P3
  // state change should be pushed to take us off the Wait page
  await itWait({ page: page3, madliberationid: "lib-progress" });
  await submitNoLibs(page3);

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Leader: now state change should be pushed to take the leader off the read
  // roster

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // P2: should get pushed to the script
  await itWait({ page: page2, madliberationid: "pass-this-device" });
  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Leader: should get pushed to the script
  await itWait({ page: page, madliberationid: "pass-this-device" });
  // Confirm both players' submissions appeared in the script
  // Wait until the Read page shows, then click the button to get to the first
  // reader, then get all the displayed libs

  const libs = [];
  // loop through script pages, adding to libs
  while (true) {
    await itWaitForAttribute(page, "mlnoncontent");
    // Get the value of madliberationid
    const id = await page
      .$eval("[mlnoncontent]", (el) => el.getAttribute("madliberationid"))
      .catch(async (e) => {
        failTest(e, "failed to get madliberationid");
      });
    if (id == "pass-this-device") {
      itClick({ page: page, madliberationid: "ready-to-read-button" });
      itWait({ page: page, madliberationid: "page" });
      const libTexts = await itGetGroupText(
        page,
        "page",
        "madliberationanswer"
      );
      libTexts.forEach((t) => {
        libs.push(t);
      });
      itClick({ page: page, madliberationid: "next-page-button" });
      continue;
    }
    if (id == "seder-ended-successfully") {
      break;
    }
    failTest("/read error", "failed to loop through script pages");
  }
  leaderAnswers.concat(p2Answers).forEach((a) => {
    if (!libs.includes(a)) {
      failTest("/read failure", `submitted lib not inserted in script: ${a}`);
    }
  });

  await browser.close();

  // Test some login-logout behaviors
  await page2.goto(site);
  // Confirm that a logged-in-only fetch works
  const sedersStarted = await page2.evaluate(
    async ({ userName }) => {
      const items = await fetch(
        `/prod/seders` + `?email=${encodeURIComponent(userName)}`,
        {
          headers: { "cache-control": "no-cache" },
          credentials: "include",
        }
      )
        .then((r) => r.json())
        .then((j) => j.Items);
      return items;
    },
    { userName: user2Name }
  );
  if (sedersStarted.length != 1) {
    failTest(
      new Error("sedersStarted.length != 1"),
      "expected to get 1 started seder"
    );
  }
  if (sedersStarted[0].room_code != abandonedSederRoomCode) {
    failTest(
      new Error("wrong seder started code in login test"),
      `expected ${abandonedSederRoomCode}, got ${sedersStarted[0].room_code}`
    );
  }
  await itClick({ page: page2, madliberationid: "logout-button" });
  await itWait({ page: page2, madliberationid: "login-button" });
  // Confirm that a logged-in-only fetch now doesn't work
  const sedersStartedStatus = await page2.evaluate(
    async ({ userName }) => {
      const status = await fetch(
        `/prod/seders` + `?email=${encodeURIComponent(userName)}`,
        {
          headers: { "cache-control": "no-cache" },
          credentials: "include",
        }
      ).then((r) => r.status);
      return status;
    },
    { userName: user2Name }
  );
  if (sedersStartedStatus < 400 || sedersStartedStatus > 499) {
    failTest(
      new Error("still logged in after logout"),
      `expected 4xx from post-logout /seders call, got ${sedersStartedStatus}`
    );
  }
  await browser2.close();
  const browser2b = await puppeteer.launch(browserOptions);
  browsers.push(browser2b);
  const page2b = await browser2b.newPage();
  await page2b.goto(site);
  await itNavigate({ page: page2b, madliberationid: "login-button" });
  await enterUserName({
    browser: browser2b,
    page: page2b,
    userName: user2Name,
  });
  await browser2b.close();
  // go to /seders and confirm that the expected seders are there

  // Print the roomCode so caller can clean up
  // console.log(`madliberation-itest roomCode: ${roomCode}`);

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
  // Clean up
  await browser3.close();
  // test user

  // seder

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////
})();
