import express, {json} from 'express';
import cors from 'cors';
import chalk from 'chalk';

const appServer = express();
appServer.use(cors());
appServer.use(json());

appServer.listen(5000, () =>{
    console.log(chalk.green('Servidor rodando na porta: 5000'));
});
