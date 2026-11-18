import { toNodeHandler } from 'better-auth/node';
import { auth } from '../../auth';

export default toNodeHandler(auth);
