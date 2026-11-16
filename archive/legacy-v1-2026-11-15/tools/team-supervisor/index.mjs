import { Plugin } from '@opencode/plugin';
import { setup } from './supervisor.mjs';
import { TeamStatusRpc } from './rpc.mjs';
export default Plugin.define({ id: 'rustwake-team-supervisor', setup: ctx => setup(ctx, TeamStatusRpc) });
