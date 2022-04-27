import { MongoClient } from 'mongodb';
import express, {json} from 'express';
import cors from 'cors';
import chalk from 'chalk';

import dotenv from 'dotenv';
dotenv.config();

const appServer = express();
appServer.use(cors());
appServer.use(json());

appServer.post('/participants', (req, res)=>{
    const {name} = req.body; 
    console.log(name);

    if(!name){
        console.log('nome não informado');
        res.sendStatus(422);
        return;
    }
    if(name){
        console.log('nome informado');
        const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
        conexaoMongo.connect().then(conexao=>{
            const db = conexao.db('API-batePapoUol').collection('participants');
            const participanteExistente = db.findOne({name: name});

            participanteExistente.then(result=>{
                console.log('promise participanteExistente');
                console.log(participanteExistente, result);
                if(result){
                    console.log('participante já existe');
                    res.sendStatus(409);
                    conexaoMongo.close();
                    return;
                }
                if(!result){
                    console.log('participante não existe');
                    const promise = db.insertOne({name, lastStatus: Date.now()});
                    promise.then(result=>{
                        const conexaoSala = new MongoClient(process.env.MONGO_CONECTION);
                        conexaoSala.connect().then(conexao=>{
                            const db = conexao.db('API-batePapoUol').collection('messages');
                            const enviarEntrada = db.insertOne({
                                from: name, 
                                to: 'Todos',
                                text: 'entra na sala...', 
                                type: 'status', 
                                time: 'HH:MM:SS'
                            });
                            console.log('nome em enviarEntrada', name);

                            enviarEntrada.then(result=>{
                                console.log('promise enviarEntrada');
                                console.log(enviarEntrada, result);
                                conexaoSala.close();
                            });
                            enviarEntrada.catch(()=>{
                                res.sendStatus(500);
                                conexaoSala.close();
                            });
                        });
                        console.log('promise insertOne');
                        console.log(promise, result);
                        res.sendStatus(201);
                        conexaoMongo.close();
                    });
                    promise.catch(err=>{
                        console.log('promise insertOne');
                        res.sendStatus(500);
                        conexaoMongo.close();
                    });
                    return;
                }
            });
            participanteExistente.catch(()=>{
                console.log('catch participanteExistente');
                res.sendStatus(500);
                conexaoMongo.close();
            });

        }).catch(()=>{
            console.log('catch conexão');
            res.send(500);
            conexaoMongo.close();
        });
    }
    
});

appServer.get('/participants', (req, res)=>{
    const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
    
    conexaoMongo.connect().then(conexao=>{
        const db = conexao.db('API-batePapoUol').collection('participants');
        const promise = db.find().toArray();

        promise.then(result=>{
            console.log('promise consulta participantes');
            res.send(result);
            conexaoMongo.close();
        }).catch(()=>{
            res.sendStatus(500);
            conexaoMongo.close();
        });
    }).catch(()=>{
        console.log('catch conexão');
        res.sendStatus(500);
        conexaoMongo.close();
    });
});

appServer.get('/messages', (req, res)=>{
    const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
    
    conexaoMongo.connect().then(conexao=>{
        const db = conexao.db('API-batePapoUol').collection('messages');
        const promise = db.find().toArray();

        promise.then(result=>{
            console.log('promise consulta mensagens');
            res.send(result);
            conexaoMongo.close();
        }).catch(()=>{
            res.sendStatus(500);
            conexaoMongo.close();
        });
    }).catch(()=>{
        console.log('catch conexão');
        res.sendStatus(500);
        conexaoMongo.close();
    });
});

appServer.listen(5000, () =>{
    console.log(chalk.green('Servidor rodando na porta: 5000'));
});
