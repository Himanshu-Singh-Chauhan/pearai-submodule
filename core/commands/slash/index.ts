import GenerateTerminalCommand from "./cmd.js";
import CommentSlashCommand from "./comment.js";
import CommitMessageCommand from "./commit.js";
import ComponentMessageCommand from "./component.js";
import DraftIssueCommand from "./draftIssue.js";
import EditSlashCommand from "./edit.js";
import HttpSlashCommand from "./http.js";
import ReviewMessageCommand from "./review.js";
import ShareSlashCommand from "./share.js";
import StackOverflowSlashCommand from "./stackOverflow.js";

export default [
  DraftIssueCommand,
  ShareSlashCommand,
  StackOverflowSlashCommand,
  GenerateTerminalCommand,
  EditSlashCommand,
  CommentSlashCommand,
  HttpSlashCommand,
  CommitMessageCommand,
  ReviewMessageCommand,
	ComponentMessageCommand,
];
