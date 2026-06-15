import React from "react";
import { Box, Text } from "ink";
import { tuiTheme } from "../theme";

interface StateBlockProps {
  title: string;
  message?: string | undefined;
  tone?: "info" | "warning" | "danger" | "muted";
  actions?: string[];
}

export function StateBlock({ title, message, tone = "info", actions = [] }: StateBlockProps) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color={tuiTheme.color[tone]} bold>
        {title}
      </Text>
      {message ? <Text color={tuiTheme.color.muted}>{message}</Text> : null}
      {actions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {actions.map((action) => (
            <Text key={action}>
              <Text color={tuiTheme.color.muted}>{tuiTheme.symbol.bullet} </Text>
              {action}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export function LoadingState({ message = "Loading..." }: { message?: string | undefined }) {
  return <StateBlock title="Loading" message={message} tone="muted" />;
}

export function EmptyState({ message = "Nothing to show yet." }: { message?: string | undefined }) {
  return (
    <StateBlock
      title="No data yet"
      message={message}
      actions={["Run kundol index", "Check configured workspaces"]}
    />
  );
}

export function ErrorState({ message = "Something went wrong." }: { message?: string | undefined }) {
  return (
    <StateBlock
      title="Unable to render view"
      message={message}
      tone="danger"
      actions={["Retry", "Use a non-interactive command for details"]}
    />
  );
}
