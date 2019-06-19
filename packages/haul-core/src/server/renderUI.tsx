import React from 'react';
import { render, Color, Box, Text } from 'ink';
import { EventEmitter } from 'events';
import { inspect } from 'util';
import throttle from 'lodash.throttle';
import {
  LOG,
  RESPONSE_FAILED,
  RESPONSE_COMPLETE,
  REQUEST_FAILED,
  COMPILATION_START,
  COMPILATION_PROGRESS,
  COMPILATION_FAILED,
  COMPILATION_FINISHED,
} from './events';
import Logger from '../runtime/Logger';

type Log =
  | {
      timestamp: number;
      level: string;
      args: any[];
      type: 'runtimeLog';
      key: number;
    }
  | {
      timestamp: number;
      method: string;
      url: string;
      statusCode: number;
      extra: string[];
      type: 'requestResponse';
      key: number;
    };
type State = {
  windowHeight: number;
  compilations: {
    [platform: string]: {
      progress: number;
      running: boolean;
    };
  };
  logs: Log[];
};

export default function renderUI(
  serverEvents: EventEmitter,
  serverInfo: { port: number; host: string }
) {
  class Root extends React.Component<{ serverEvents: EventEmitter }, State> {
    state: State = {
      windowHeight: process.stdout.rows!,
      compilations: {},
      logs: [],
    };

    componentDidMount() {
      let index = 0;
      const pushLog = (log: Log) => {
        this.setState(state => ({
          logs: [...state.logs, log].slice(-100),
        }));
      };

      const makeCommonLogData = () => ({
        timestamp: Date.now(),
        key: Date.now() + index,
      });

      this.props.serverEvents.on(LOG, ({ level, args }) => {
        pushLog({
          level,
          args,
          type: 'runtimeLog',
          ...makeCommonLogData(),
        });
      });

      this.props.serverEvents.on(REQUEST_FAILED, ({ request, event }) => {
        pushLog({
          method: request.method,
          url: request.path,
          statusCode: request.response.statusCode,
          extra: event,
          type: 'requestResponse',
          ...makeCommonLogData(),
        });
      });

      this.props.serverEvents.on(RESPONSE_FAILED, ({ request }) => {
        pushLog({
          method: request.method,
          url: request.path,
          statusCode: request.response.statusCode,
          type: 'requestResponse',
          extra: [],
          ...makeCommonLogData(),
        });
      });

      this.props.serverEvents.on(RESPONSE_COMPLETE, ({ request }) => {
        pushLog({
          method: request.method,
          url: request.path,
          statusCode: request.response.statusCode,
          type: 'requestResponse',
          extra: [],
          ...makeCommonLogData(),
        });
      });

      this.props.serverEvents.on(COMPILATION_START, ({ platform }) => {
        this.setState(state => ({
          compilations: {
            ...state.compilations,
            [platform]: {
              running: true,
              progress: 0,
            },
          },
        }));
      });

      this.props.serverEvents.on(
        COMPILATION_PROGRESS,
        throttle(({ platform, progress }) => {
          this.setState(state => ({
            compilations: {
              ...state.compilations,
              [platform]: {
                running: true,
                progress: Math.max(Math.min(progress, 1), 0),
              },
            },
          }));
        }, 20)
      );

      this.props.serverEvents.on(
        COMPILATION_FAILED,
        ({ platform, message }) => {
          this.setState(state => ({
            compilations: {
              ...state.compilations,
              [platform]: {
                running: false,
                progress: 0,
              },
            },
            logs: [
              ...state.logs,
              {
                level: Logger.Level.Error,
                args: [message],
                type: 'runtimeLog',
                ...makeCommonLogData(),
              } as Log,
            ].slice(-100),
          }));
        }
      );

      this.props.serverEvents.on(
        COMPILATION_FINISHED,
        ({ platform, errors }) => {
          this.setState(state => ({
            compilations: {
              ...state.compilations,
              [platform]: {
                running: false,
                progress: 1,
              },
            },
            logs: [
              ...state.logs,
              ...errors.map((error: string) => ({
                level: Logger.Level.Error,
                args: [error],
                type: 'runtimeLog',
                ...makeCommonLogData(),
              })),
            ].slice(-100),
          }));
        }
      );
    }

    render() {
      const logsRenderLength =
        this.state.windowHeight -
        5 -
        Math.max(Object.keys(this.state.compilations).length, 1);
      return (
        <Box flexDirection="column">
          <Text bold>
            <Color blue>
              Packager server running on http://{serverInfo.host}:
              {serverInfo.port}
            </Color>
          </Text>
          <Box
            marginLeft={2}
            marginTop={1}
            marginBottom={1}
            flexDirection="column"
            alignItems="flex-end"
            width={34}
          >
            {Object.keys(this.state.compilations).map(platform => {
              return (
                <CompilationStatus
                  key={platform}
                  platform={platform}
                  progress={this.state.compilations[platform]!.progress}
                  running={this.state.compilations[platform]!.running}
                />
              );
            })}
            {Object.keys(this.state.compilations).length === 0 ? (
              <Color gray>No compilation available yet...</Color>
            ) : null}
          </Box>
          <Text bold>
            <Color blue>Logs:</Color>
          </Text>
          <Box
            marginLeft={2}
            marginTop={1}
            flexDirection="column"
            height={logsRenderLength - 1}
          >
            {this.state.logs.slice(-logsRenderLength).map(log => {
              if (log.type === 'runtimeLog') {
                return (
                  <RuntimeLog key={log.key} level={log.level} args={log.args} />
                );
              } else if (log.type === 'requestResponse') {
                return (
                  <RequestResponseLog
                    key={log.key}
                    method={log.method}
                    url={log.url}
                    statusCode={log.statusCode}
                    extra={log.extra}
                  />
                );
              }
            })}
          </Box>
        </Box>
      );
    }
  }

  render(<Root serverEvents={serverEvents} />);
}

function CompilationStatus({
  platform,
  progress,
  running = false,
}: {
  running?: boolean;
  platform: string;
  progress: number;
}) {
  const barWidth = 20;
  const progressLength = Math.floor(progress * barWidth);
  const progressBar = `[${'='.repeat(progressLength)}${' '.repeat(
    barWidth - progressLength
  )}]`;
  return (
    <Box>
      <Box marginRight={1}>
        <Text bold>
          <Color magenta>{platform.toUpperCase()}</Color>
        </Text>
      </Box>

      <Color gray={!running} white={running}>
        {progressBar}
      </Color>

      <Box marginLeft={1} width={4}>
        <Color gray={!running} green={running}>
          {Math.floor(progress * 100)}%
        </Color>
      </Box>
    </Box>
  );
}

function RuntimeLog({ level, args }: { level: string; args: any[] }) {
  return (
    <Box>
      <Box marginRight={1}>
        <Color
          green={level === Logger.Level.Done}
          red={level === Logger.Level.Error}
          yellow={level === Logger.Level.Warn}
          white={level === Logger.Level.Info}
          gray={level === Logger.Level.Debug}
        >
          <Text bold>{level}</Text>
        </Color>
      </Box>
      ▶︎
      <Box marginLeft={1}>
        {args
          .map(item => (typeof item === 'string' ? item : inspect(item)))
          .join(' ')}
      </Box>
    </Box>
  );
}

function RequestResponseLog({
  method,
  url,
  statusCode,
  extra,
}: {
  method: string;
  url: string;
  statusCode: number;
  extra: string[];
}) {
  return (
    <Box>
      <Box marginRight={1}>
        <Color
          green={statusCode < 300}
          yellow={statusCode >= 300 && statusCode < 400}
          red={statusCode >= 400}
        >
          <Text bold>{method.toUpperCase()}</Text>
        </Color>
      </Box>
      {url}
      <Box marginLeft={1} marginRight={1}>
        <Color gray>{statusCode}</Color>
      </Box>
      {extra.length ? (
        <Box>
          -
          <Box marginLeft={1}>
            <Color>{extra.join(' ')}</Color>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}