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

appServer.post('/participants', async (req, res)=>{
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
        try {
            const conexao = await conexaoMongo.connect();
            const db = conexao.db('API-batePapoUol').collection('participants');
            const participanteExistente = await db.findOne({name: name});
            console.log('participanteExiste', participanteExistente);

            if(participanteExistente){
                console.log('participante já existe');
                res.sendStatus(409);
                conexaoMongo.close();
                return;
            }
            if(!participanteExistente){
                console.log('participante não existe');
                const enviarMensagem = await db.insertOne({name, lastStatus: Date.now()});
                console.log('enviarMensagem', enviarMensagem);
            
                const conexaoSala = new MongoClient(process.env.MONGO_CONECTION);
                try {
                    const conexaoMensagensDb = await conexaoSala.connect();
                    const dbMensagens = conexaoMensagensDb.db('API-batePapoUol').collection('messages');
                    const enviarEntrada = await dbMensagens.insertOne({
                        from: name, 
                        to: 'Todos',
                        text: 'entra na sala...', 
                        type: 'status', 
                        time: `${dayjs(Date.now()).format('HH:mm:ss')}`
                    });
                    console.log('nome em enviarEntrada', name);
                    console.log('enviarEntrada', enviarEntrada);
                    res.sendStatus(201);
                    conexaoSala.close();
                    conexaoMongo.close();
                    return;
                }
                catch(err){
                    console.log(err);
                    res.sendStatus(500);
                    conexaoSala.close();
                    conexaoMongo.close();
                    return;
                }
            }
        } catch (error) {
            console.log(error);
            res.sendStatus(500);
            conexaoMongo.close();
        }
    }
});

appServer.get('/participants', async (req, res)=>{
    const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
    try{
        const conexao = await conexaoMongo.connect();
        const db = conexao.db('API-batePapoUol').collection('participants');
        const participantes = await db.find().toArray();
        res.send(participantes);
        conexaoMongo.close();
    }
    catch(err){
        console.log('catch conexão');
        res.sendStatus(500);
        conexaoMongo.close();
    }
});

appServer.post('/messages', async (req, res)=>{
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
            try {
                const conexao = await conexaoMongo.connect();
                const db = conexao.db('API-batePapoUol').collection('participants');
                const existeUser = await db.findOne({name: user});

                if(existeUser){
                    console.log('existeUser');
                    const conexaoSala = new MongoClient(process.env.MONGO_CONECTION);
                    try{
                        const conexaoMensagens = await conexaoSala.connect();
                        const dbMensagens = conexaoMensagens.db('API-batePapoUol').collection('messages');
                        const enviarMensagem = await dbMensagens.insertOne({
                            from: user, to, text, type, time: `${dayjs(Date.now()).format('HH:mm:ss')}`
                        });
                        console.log('enviarMensagem', enviarMensagem);
                        res.sendStatus(201);
                        conexaoSala.close();
                        conexaoMongo.close();
                        return;
                    }
                    catch(err){
                        console.log(err);
                        res.sendStatus(500);
                        conexaoSala.close();
                        conexaoMongo.close();
                        return;
                    }
                }
                if(!existeUser){
                    console.log('não existeUser');
                    res.sendStatus(422);
                    conexaoMongo.close();
                    return;
                }
            }
            catch(err){
                console.log('catch conexão');
                res.sendStatus(500);
                conexaoMongo.close();
            }
        }else{
            console.log('tipo de mensagem inválida');
            res.sendStatus(422);
            return;
        }
    }
});

appServer.get('/messages', async (req, res)=>{
    const {limit} = req.query;
    const {user} = req.headers;
    
    if(!user){
        console.log('Para visualizar as mensagens é necessário informar o usuário');
        res.sendStatus(422);
        return;
    }

    try {
        const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
        const conexao = await conexaoMongo.connect();
        const db = conexao.db('API-batePapoUol').collection('messages');
        const mensagens = await db.find().toArray();

        if(parseInt(limit) === 0 || parseInt(limit) < 0){
            console.log('limit menor ou igual a zero');
            res.send(mensagens);
            conexaoMongo.close();
            return;
        }
        if(parseInt(limit) < mensagens.length){
            const ultimasMensagens = [...mensagens].splice(mensagens.length - limit, mensagens.length);
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
        if (limit) {
            const mensagensLimitadas = [...mensagens].splice(0, limit);
            if (user) {
                const mensagensAoUsuario = mensagensLimitadas.filter(mensagem => {
                    return (
                        mensagem.to === "Todos" ||
                        mensagem.to === user ||
                        mensagem.from === user
                    );
                });
                console.log("mensagensLimitadas", mensagensLimitadas);
                res.send(mensagensAoUsuario);
                conexaoMongo.close();
                return;
            }
        }
        if (!limit && user) {
            const mensagensAoUsuario = mensagens.filter(mensagem => {
                return (
                    mensagem.to === "Todos" ||
                    mensagem.to === user ||
                    mensagem.from === user
                );
            });
            console.log("ultimasMensagens", mensagens);
            res.send(mensagensAoUsuario);
            conexaoMongo.close();
            return;
        }
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
        conexaoMongo.close();
    }
});

appServer.post('/status', (req, res)=>{
    const {user} = req.headers;
    console.log('user', user);

    if(!user){
        console.log('Para visualizar o status é necessário informar o usuário');
        res.sendStatus(422);
        return;
    }
    if(user){
        console.log('Executando consulta de status');
        const conexaoListaParticipantes = new MongoClient(process.env.MONGO_CONECTION);
        conexaoListaParticipantes.connect().then(conexao=>{
            const db = conexao.db('API-batePapoUol').collection('participants');
            const participante = db.findOne({name: user});

            participante.then(result=>{
                if(result){
                    console.log('result', result);
                    const promise = db.updateOne({name: user}, {$set: {lastStatus: Date.now()}});
                    promise.then(result=>{
                        console.log('promise', result);
                        res.sendStatus(200);
                        conexaoListaParticipantes.close();
                        return;
                    });
                    promise.catch(()=>{
                        console.log('catch promise');
                        res.sendStatus(500);
                        conexaoListaParticipantes.close();
                    });
                }
                if(!result){
                    console.log('Participante não existe');
                    res.sendStatus(404);
                    conexaoListaParticipantes.close();
                    return;
                }
            });
            participante.catch(()=>{
                console.log('catch participante');
                res.sendStatus(500);
                conexaoListaParticipantes.close();
            });
            
        }).catch(()=>{
            console.log('catch conexão');
            res.sendStatus(500);
            conexaoListaParticipantes.close();
        });
        return;
    }
});

setInterval(()=>{
    const conexaoListaParticipantes = new MongoClient(process.env.MONGO_CONECTION);
    conexaoListaParticipantes.connect().then(conexao=>{
        const db = conexao.db('API-batePapoUol').collection('participants');
        const promise = db.find().toArray();

        promise.then(result=>{
            console.log('promise consulta em Array de participantes', result);
            if(result.length > 0){
                const participantesColecao = [...result];
                console.log('participantesColecao', participantesColecao);
                const participantesOffline = participantesColecao.filter(participante=>{
                    return (Date.now() - participante.lastStatus) > 10000;
                });
                console.log('participantes que podem estar offline', participantesOffline);
                
                if(participantesOffline.length > 0){
                    const apagarParticipante = db.deleteMany({name: {$in: participantesOffline.map(participante=>{
                        return participante.name;
                    })}});
                    apagarParticipante.then(result=>{
                        console.log('apagarParticipante', result);
                        const conexaoMensagens = new MongoClient(process.env.MONGO_CONECTION);
                        conexaoMensagens.connect().then(conexaoDb=>{
                            const arrClone = [...participantesOffline];
                            console.log('arrClone', arrClone);
                            const dbMensagemSaida = conexaoDb.db('API-batePapoUol').collection('messages');
                            const promiseMensagemSaida = dbMensagemSaida.insertMany(arrClone.map(participante=>{
                                return {
                                    from: participante.name,
                                    to: 'Todos',
                                    text: 'sai da sala...',
                                    time: `${dayjs(Date.now()).format('HH:mm:ss')}`
                                }
                            }));
                            console.log('promiseMensagemSaida', promiseMensagemSaida);
    
                            promiseMensagemSaida.then(result=>{
                                console.log('promiseMensagemSaida na promise', result);
                                conexaoListaParticipantes.close();
                                return;
                            }).catch(()=>{
                                console.log('catch promiseMensagemSaida');
                                conexaoListaParticipantes.close();
                            });
                            
                        }).catch(()=>{
                            console.log('catch conexão');
                            res.sendStatus(500);
                            conexaoMensagens.close();
                        });
                    });
                    apagarParticipante.catch(()=>{
                        console.log('catch promise');
                        conexaoListaParticipantes.close();
                    });
                }

                if(participantesOffline.length === 0){
                    console.log('Nenhum participante que pode estar offline');
                    conexaoListaParticipantes.close();
                    return;
                }
            }
            if(result.length === 0){
                console.log('Não há participantes');
                conexaoListaParticipantes.close();
                return;
            }
        });
        promise.catch(()=>{
            console.log('catch promise Array participants');
            conexaoListaParticipantes.close();
        });

    }).catch(()=>{
        console.log('catch conexão');
        conexaoListaParticipantes.close();
    });
}, 15000);

appServer.listen(5000, () =>{
    console.log(chalk.green('Servidor rodando na porta: 5000'));
});
