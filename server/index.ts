import {createServer} from 'node:http'
import {handleRequest} from './handler'
createServer(handleRequest).listen(Number(process.env.PORT || 3001),process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1'),()=>console.log('Kin AI service ready.'))
