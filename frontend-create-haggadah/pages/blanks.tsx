/** @jsxRuntime classic */
/** @jsx jsx */
import * as React from "react";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import MadLiberationLogo from "../public/mad-liberation-logo.png";
import VeryAwesomePassoverLogo from "../public/VAPLogo-white.png";
import { Global, css, jsx } from "@emotion/react";
import { Button, Paper, Chip, TextField } from "@mui/material";
import DoneIcon from "@mui/icons-material/Done";
import SederSummary from "../src/SederSummary";
import Head from "next/head";

interface Assignment {
  id: number;
  prompt: string;
  sentence?: string;
  example?: string;
}
interface Answer {
  id: number;
  text: string;
}
enum PageState {
  LOADING = 0,
  READY,
  FETCHING,
}
const PromptSection = (props: {
  submitLib: any;
  answers: any;
  setAnswers: any;
  assignments: Array<Assignment>;
  selectedAssignmentIndex: number;
  setSelectedAssignmentIndex: React.Dispatch<React.SetStateAction<number>>;
  pageState: PageState;
  setPageState: React.Dispatch<PageState>;
}) => {
  const {
    submitLib,
    answers,
    setAnswers,
    assignments,
    selectedAssignmentIndex,
    setSelectedAssignmentIndex,
    pageState,
    setPageState,
  } = props;
  const [enteredText, setEnteredText] = React.useState("");
  const [submitLibError, setSubmitLibError] = React.useState(false);
  const [clientAnswers, setClientAnswers] = React.useState({});
  if (assignments.length < 1) {
    return <div></div>;
  }
  if (selectedAssignmentIndex >= assignments.length) {
    setSelectedAssignmentIndex(0);
    if (typeof window !== "undefined") {
      window.location.hash = "";
    }
    return <div></div>;
  }
  const assignment = assignments[selectedAssignmentIndex];

  const answer = answers[`${assignment.id}`];
  React.useEffect(() => {
    setEnteredText("");
  }, [selectedAssignmentIndex]);
  return (
    <div>
      <div>
        <Typography component="p" paragraph gutterBottom>
          Enter a word or phrase to replace...
        </Typography>
      </div>

      <Container maxWidth="sm">
        <Paper id="this-prompt" elevation={3} style={{ textAlign: "center" }}>
          {assignment.prompt}
        </Paper>
        <br />
        {assignment &&
          answers &&
          assignment.id &&
          answers[`${assignment.id}`] && (
            <div>
              <div>Your current answer is:</div>
              <div>{answer}</div>
            </div>
          )}
        <br />
        <TextField
          id="answer"
          variant="outlined"
          fullWidth
          // defaultValue={answer || ""}
          value={enteredText}
          onChange={(event) => {
            setEnteredText(event.target.value);
          }}
        ></TextField>
        {assignment.sentence && (
          <div>
            <Typography component="span">
              Your answer should complete the sentence:{" "}
              <span style={{ color: "blue", fontStyle: "italic" }}>
                {assignment.sentence.replace(/_/, "__")}
              </span>
            </Typography>
          </div>
        )}
        {assignment.example && (
          <div>
            <Typography component="span">
              For example, you could write:{" "}
              <span style={{ color: "blue", fontStyle: "italic" }}>
                {assignment.example}
              </span>
            </Typography>
          </div>
        )}
        <div>
          <br />
          <Button
            color="primary"
            variant="contained"
            disabled={pageState !== PageState.READY}
            onClick={async () => {
              const submitLibSuccess = await submitLib({
                answerText: enteredText,
                answerId: assignment.id,
              });
              if (!submitLibSuccess) {
                setSubmitLibError(true);
                return;
              }
              setAnswers((oldAnswers: any) => {
                return { ...oldAnswers, [`${assignment.id}`]: enteredText };
              });
              setSubmitLibError(false);
            }}
          >
            Submit this one
          </Button>
        </div>
        {submitLibError && (
          <div>
            <Typography
              component="p"
              paragraph
              gutterBottom
              style={{ color: "red" }}
            >
              Unable to submit that answer
            </Typography>
          </div>
        )}
      </Container>
    </div>
  );
};
const ChipSection = (props: {
  submitLib: any;
  setSelectedAssignmentIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedAssignmentIndex: number;
  assignments: Array<Assignment>;
  answers: any;
  pageState: PageState;
  setPageState: React.Dispatch<PageState>;
}) => {
  const {
    submitLib,
    setSelectedAssignmentIndex,
    selectedAssignmentIndex,
    assignments,
    answers,
    pageState,
    setPageState,
  } = props;
  return (
    <div>
      {assignments.map((assignment, assignmentIndex) => {
        return (
          <Chip
            id={`prompt-chip-${assignmentIndex}`}
            label={assignment.prompt}
            color={
              assignmentIndex === selectedAssignmentIndex
                ? "primary"
                : "default"
            }
            clickable={true}
            onClick={() => {
              setSelectedAssignmentIndex(assignmentIndex);
              if (typeof window !== "undefined") {
                window.location.hash = `${assignmentIndex}`;
              }
            }}
            size="small"
            icon={
              answers &&
              assignment &&
              assignment.id &&
              assignment.id in answers ? (
                <DoneIcon />
              ) : undefined
            }
          ></Chip>
        );
      })}
    </div>
  );
};
const ReadLinkSection = (props: {
  readLink: string;
  readRosterLink: string;
}) => {
  const { readLink, readRosterLink } = props;
  return (
    <div>
      <div>
        The link to the finished product is:{" "}
        <a target={"_blank"} href={readLink} id={"read-link"}>
          here
        </a>
        . It updates as people fill in their blanks.
      </div>
      <div>
        See who's filled in their blanks{" "}
        <a target={"_blank"} href={readRosterLink} id={"read-roster-link"}>
          here
        </a>
        .
      </div>
    </div>
  );
};
export default function Blanks() {
  const [pageState, setPageState] = React.useState(PageState.LOADING);
  const [assignments, setAssignments] = React.useState<Array<Assignment>>([]);
  const [answers, setAnswers] = React.useState({});
  const [selectedAssignmentIndex, setSelectedAssignmentIndex] = React.useState(
    typeof window !== "undefined" &&
      window.location &&
      window.location.hash &&
      window.location.hash.split("#")[1] &&
      parseInt(window.location.hash.split("#")[1])
      ? parseInt(window.location.hash.split("#")[1])
      : 0
  );
  const [readLink, setReadLink] = React.useState("");
  const [readRosterLink, setReadRosterLink] = React.useState("");
  const [rpw, setRpw] = React.useState("");
  const [gameName, setGameName] = React.useState();
  let sederCode: any, pw: any, ph: any;
  if (typeof window !== "undefined" && typeof URLSearchParams === "function") {
    const urlSearchParams = new URLSearchParams(window.location.search);
    sederCode = urlSearchParams.get("sederCode");
    pw = urlSearchParams.get("pw");
    ph = urlSearchParams.get("ph");
  }
  const submitLib = async (props: { answerText: string; answerId: number }) => {
    const { answerText, answerId } = props;
    const submitLibFetchInit = {
      method: "POST",
      body: JSON.stringify({
        sederCode,
        pw,
        ph,
        answerText,
        answerId,
      }),
      headers: { "Content-Type": "application/json" },
    };
    setPageState(PageState.FETCHING);
    const submitLibResponse = await fetch(
      "../v2/submit-lib",
      submitLibFetchInit
    );
    setPageState(PageState.READY);
    if (submitLibResponse.status === 200) {
      return true;
    }
    return false;
  };
  React.useEffect(() => {
    (async () => {
      if (sederCode && pw && ph) {
        const fetchAssignmentsResponse = await fetch(
          `../v2/assignments?sederCode=${sederCode}&pw=${pw}&roomcode=${sederCode}&ph=${ph}`
        );
        if (fetchAssignmentsResponse.status !== 200) {
          return;
        }
        const fetchAssignmentsData = await fetchAssignmentsResponse.json();
        setAssignments(fetchAssignmentsData);

        const fetchAnswersMapResponse = await fetch(
          `../v2/answers-map?sederCode=${sederCode}&pw=${pw}&ph=${ph}`
        );
        if (fetchAnswersMapResponse.status !== 200) {
          return;
        }
        const fetchAnswersMapData = await fetchAnswersMapResponse.json();
        setAnswers(fetchAnswersMapData);

        try {
          const fetchRpwResponse = await fetch(
            `../v2/rpw?sederCode=${sederCode}&pw=${pw}&ph=${ph}&roomcode=${sederCode}`
          );
          if (fetchRpwResponse.status !== 200) {
            // TODO: handle error, here and at other fetches, might not need try-catch
            return;
          }
          const fetchRpwData = await fetchRpwResponse.json();
          if (
            typeof window !== "undefined" &&
            window.location &&
            window.location.origin
          ) {
            const rl = window.document.createElement("a");
            rl.href = `${window.location.origin}/create-haggadah/read.html?sederCode=${sederCode}&rpw=${fetchRpwData.rpw}&roomcode=${sederCode}#1`;
            setReadLink(rl.href);
            setRpw(fetchRpwData.rpw);
            const rrl = window.document.createElement("a");
            rrl.href = `${window.location.origin}/create-haggadah/read-roster.html?sederCode=${sederCode}&rpw=${fetchRpwData.rpw}&roomcode=${sederCode}`;
            setReadRosterLink(rrl.href);
          }
        } catch (err) {
          console.log(err);
        }

        const fetchGameNameResponse = await fetch(
          `../v2/game-name?sederCode=` +
            `${sederCode}&pw=${pw}&ph=${ph}&roomcode=${sederCode}`
        );
        if (fetchGameNameResponse.status === 200) {
          const fetchGameNameData = await fetchGameNameResponse.json();
          setGameName(fetchGameNameData.gameName);
        }

        setPageState(PageState.READY);
      }
    })();
  }, []);
  return (
    <div>
      {sederCode &&
        typeof sederCode === "string" &&
        gameName &&
        typeof gameName === "string" && (
          <Head>
            <title>
              {gameName}'s Link, Seder {sederCode.substring(0, 3)}
            </title>
          </Head>
        )}
      <div
        style={{
          backgroundColor: "#81181f",
          height: "100%",
          minHeight: "100%",
        }}
      >
        <div>
          <img
            css={{
              height: "200px",
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
            }}
            src={`${MadLiberationLogo.src}`}
          ></img>
        </div>
        <Container maxWidth="md">
          <Paper>
            <div style={{ padding: "8px" }}>
              {pageState !== PageState.LOADING && answers && (
                <PromptSection
                  submitLib={submitLib}
                  answers={answers}
                  setAnswers={setAnswers}
                  assignments={assignments}
                  selectedAssignmentIndex={selectedAssignmentIndex}
                  setSelectedAssignmentIndex={setSelectedAssignmentIndex}
                  pageState={pageState}
                  setPageState={setPageState}
                ></PromptSection>
              )}
              <br />
              <br />
              <br />
              {pageState !== PageState.LOADING && answers && (
                <ChipSection
                  submitLib={submitLib}
                  setSelectedAssignmentIndex={setSelectedAssignmentIndex}
                  selectedAssignmentIndex={selectedAssignmentIndex}
                  assignments={assignments}
                  answers={answers}
                  pageState={pageState}
                  setPageState={setPageState}
                ></ChipSection>
              )}
              {pageState !== PageState.LOADING && gameName && (
                <div>
                  <br />
                  <div>Submitting answers as {gameName}.</div>
                </div>
              )}
              {pageState !== PageState.LOADING &&
                readLink !== "" &&
                readRosterLink !== "" && (
                  <ReadLinkSection
                    readLink={readLink}
                    readRosterLink={readRosterLink}
                  ></ReadLinkSection>
                )}
              <div>
                {sederCode && rpw && (
                  <SederSummary sederCode={sederCode} rpw={rpw}></SederSummary>
                )}
              </div>
            </div>
          </Paper>
        </Container>
        <br></br>
        <img
          css={{
            height: "70px",
            display: "block",
            marginLeft: "auto",
            marginRight: "auto",
          }}
          src={`${VeryAwesomePassoverLogo.src}`}
        ></img>
      </div>
    </div>
  );
}
