import express, {json} from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';

import chalk from 'chalk';
import dayjs from 'dayjs';

import dotenv from 'dotenv';
dotenv.config();

const appServer = express();
appServer.use(cors());
appServer.use(json());

appServer.post('/participants', (req, res)=>{
    const {name} = req.body; 
    console.log("nome:", name);

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
                                time: `${dayjs(Date.now()).format('HH:mm:ss')}`
                            });
                            console.log('nome em enviarEntrada', name);

                            enviarEntrada.then(result=>{
                                console.log('promise enviarEntrada');
                                console.log(enviarEntrada, result);
                                
                                console.log('promise insertOne');
                                console.log(promise, result);
                                res.sendStatus(201);
                                conexaoSala.close();
                            });
                            enviarEntrada.catch(()=>{
                                res.sendStatus(500);
                                conexaoSala.close();
                            });
                        }).catch(()=>{
                            console.log('catch conexaoSala');
                            res.sendStatus(500);
                            conexaoSala.close();
                        });
                        conexaoMongo.close();
                    });
                    promise.catch(err=>{
                        console.log('catch insertOne');
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

appServer.post('/messages', (req, res)=>{
    const {to, text, type} = req.body;
    const {user} = req.headers;
     
    if(!to || !text || !type || !user){
        console.log('dados não informados');
        res.sendStatus(422);
        return;
    }

    if(to && text && type && user){
        console.log('dados informados');
        if(type === 'message' || type === 'private_message'){
            console.log('type: message ou private_message');
            console.log(to, user, text, type);
            const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
            conexaoMongo.connect().then(conexao=>{
                const db = conexao.db('API-batePapoUol').collection('participants');
                const existeUser = db.findOne({name: user});

                existeUser.then(result=>{
                    if(result){
                        console.log('promise existeUser');
                        console.log(existeUser, result);
                        const conexaoSala = new MongoClient(process.env.MONGO_CONECTION);
                        conexaoSala.connect().then(conexao=>{
                            const db = conexao.db('API-batePapoUol').collection('messages');
                            const promiseMensagem = db.insertOne({
                                from: user, to, text, type, time: `${dayjs(Date.now()).format('HH:mm:ss')}`
                            });

                            promiseMensagem.then(result=>{
                                console.log('promiseMensagem');
                                console.log(promiseMensagem, result);
                                res.sendStatus(201);
                                conexaoSala.close();
                                return;
                            });
                            promiseMensagem.catch(()=>{
                                console.log('catch promiseMensagem');
                                res.sendStatus(500);
                                conexaoSala.close();
                            });

                        }).catch(()=>{
                            console.log('catch conexaoSala');
                            res.sendStatus(500);
                            conexaoSala.close();
                        });
                    }
                    if(!result){
                        console.log('user não existe');
                        res.sendStatus(422);
                        conexaoMongo.close();
                        return;
                    }
                    
                });
                existeUser.catch(()=>{
                    console.log('catch existeUser');
                    res.sendStatus(500);
                    conexaoMongo.close();
                });
            }).catch(()=>{
                console.log('catch conexão');
                res.sendStatus(500);
                conexaoMongo.close();
            });
        }else{
            console.log('tipo de mensagem inválida');
            res.sendStatus(422);
            return;
        }
    }
});

appServer.get('/messages', (req, res)=>{
    const {limit} = req.query;
    const {user} = req.headers;
    
    if(!user){
        console.log('Para visualizar as mensagens é necessário informar o usuário');
        res.sendStatus(422);
        return;
    }
    
    const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
    conexaoMongo.connect().then(conexao=>{
        const db = conexao.db('API-batePapoUol').collection('messages');
        const promise = db.find().toArray();

        promise.then(result=>{
            console.log('promise consulta mensagens', result);
            if(parseInt(limit) === 0 || parseInt(limit) < 0){
                console.log('limit menor ou igual a zero');
                res.send(result);
                conexaoMongo.close();
                return;
            }
            if(parseInt(limit) < result.length){
                const ultimasMensagens = [...result].splice(result.length - limit, result.length);
                if(user){
                    const mensagensAoUsuario = ultimasMensagens.filter(mensagem=>{
                        return mensagem.to === "Todos" || mensagem.to === user || 
                        mensagem.from === user;
                    });
                    console.log('ultimas mensagens', ultimasMensagens);
                    res.send(mensagensAoUsuario);
                    conexaoMongo.close();
                    return;
                }
            }
            if(limit){
                const mensagensLimitadas = [...result].slice(0, limit);
                if(user){
                    const mensagensAoUsuario = mensagensLimitadas.filter(mensagem=>{
                        return mensagem.to === "Todos" || mensagem.to === user || 
                        mensagem.from === user;
                    });
                    console.log('mensagensLimitadas', mensagensLimitadas);
                    res.send(mensagensAoUsuario);
                    conexaoMongo.close();
                    return;
                }
            }
            if(!limit && user){
                const mensagensAoUsuario = result.filter(mensagem=>{
                    return mensagem.to === "Todos" || mensagem.to === user || 
                    mensagem.from === user;
                });
                console.log('ultimasMensagens', result);
                res.send(mensagensAoUsuario);
                conexaoMongo.close();
                return;
            }
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
