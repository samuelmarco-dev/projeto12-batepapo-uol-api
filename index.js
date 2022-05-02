import express, {json} from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import joi from 'joi';

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

    if(Number(name)){
        res.sendStatus(422);
        return;
    } 

    const schemaName = joi.object({
        name: joi.string().min(1).required()
    });
    const validacao = schemaName.validate({name: name}, {abortEarly: false});
    console.log("validacao:", validacao);

    if(validacao.error){
        console.log('nome invalido', validacao.error.details);
        res.sendStatus(422);
        return;
    }
    if(validacao.value.name.length >= 1){
        console.log('nome informado:', validacao.value.name);
        const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
        try {
            const conexao = await conexaoMongo.connect();
            const db = conexao.db('API-batePapoUol').collection('participants');
            const participanteExistente = await db.findOne({name: name});
            console.log('participanteExiste', participanteExistente);

            if(participanteExistente){
                console.log('participante já existe');
                res.sendStatus(409);
                await conexaoMongo.close();
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
                    await conexaoSala.close();
                    await conexaoMongo.close();
                    return;
                }
                catch(err){
                    console.log(err);
                    res.sendStatus(500);
                    await conexaoSala.close();
                    await conexaoMongo.close();
                    return;
                }
            }
        } catch (error) {
            console.log(error);
            res.sendStatus(500);
            await conexaoMongo.close();
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
        await conexaoMongo.close();
    }
    catch(err){
        console.log('catch conexão');
        res.sendStatus(500);
        await conexaoMongo.close();
    }
});

appServer.post('/messages', async (req, res)=>{
    const {to, text, type} = req.body;
    const {user} = req.headers;

    if(Number(to) || Number(text) || Number(user)){
        res.sendStatus(422);
        return;
    }

    const schemaMensagem = joi.object({
        to: joi.string().min(1).required(),
        text: joi.string().min(1).required(),
        type: joi.string().valid('message', 'private_message')
    });
    const validacao = schemaMensagem.validate({to, text, type}, {abortEarly: false});
    console.log("validacao:", validacao);

    if(validacao.error || !user){
        console.log('dados não informados');
        res.sendStatus(422);
        return;
    }

    if(validacao.value.to.length >= 1 && validacao.value.text.length >= 1 && (validacao.value.type === 'message' || 
    validacao.value.type === 'private_message') && user){
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
                        await conexaoSala.close();
                        await conexaoMongo.close();
                        return;
                    }
                    catch(err){
                        console.log(err);
                        res.sendStatus(500);
                        await conexaoSala.close();
                        await conexaoMongo.close();
                        return;
                    }
                }
                if(!existeUser){
                    console.log('não existeUser');
                    res.sendStatus(422);
                    await conexaoMongo.close();
                    return;
                }
            }
            catch(err){
                console.log('catch conexão');
                res.sendStatus(500);
                await conexaoMongo.close();
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
    
    if(!user || Number(user)){
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
            await conexaoMongo.close();
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
                await conexaoMongo.close();
                return;
            }
        }
        if (limit) {
            const mensagensLimitadas = [...mensagens].splice(0, limit);
            if (user) {
                const mensagensAoUsuario = mensagensLimitadas.filter(mensagem => {
                    return (
                        mensagem.to === "Todos" || mensagem.to === user ||
                        mensagem.from === user
                    );
                });
                console.log("mensagensLimitadas", mensagensLimitadas);
                res.send(mensagensAoUsuario);
                await conexaoMongo.close();
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
            await conexaoMongo.close();
            return;
        }
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
        await conexaoMongo.close();
    }
});

appServer.post('/status', async (req, res)=>{
    const {user} = req.headers;
    console.log('user', user);

    if(!user || Number(user)){
        console.log('Para visualizar o status é necessário informar o usuário');
        res.sendStatus(422);
        return;
    }
    if(user){
        console.log('Executando consulta de status');
        const conexaoListaParticipantes = new MongoClient(process.env.MONGO_CONECTION);
        try {
            const conexao = await conexaoListaParticipantes.connect();
            const db = conexao.db('API-batePapoUol').collection('participants');
            const participante = await db.findOne({name: user});

            if(participante){
                console.log('participante', participante);
                const atualizarParticipante = await db.updateOne({name: user}, {$set: {lastStatus: Date.now()}});
                console.log('atualizarParticipante', atualizarParticipante);
                res.sendStatus(200);
                await conexaoListaParticipantes.close();
                return;
            }
            if(!participante){
                console.log('Participante não existe');
                res.sendStatus(404);
                await conexaoListaParticipantes.close();
                return;
            }
        }
        catch(err){
            console.log(err);
            res.sendStatus(500);
            await conexaoListaParticipantes.close();
            return;
        }
    }
});

appServer.delete('/messages/:id', async (req, res)=>{
    const {user} = req.headers;
    const {id} = req.params;

    if(!user || !id || Number(user)){
        console.log('Para deletar uma mensagem é necessário informar o usuário e o id');
        res.sendStatus(422);
        return;
    }
    if(user && id){
        console.log('Consultando mensagem para ser apagada');
        const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
        try {
            const conexao = await conexaoMongo.connect();
            const db = conexao.db('API-batePapoUol').collection('messages');
            const mensagem = await db.findOne({_id: new ObjectId(id)});
            
            if(mensagem){
                console.log('mensagem', mensagem);
                if(mensagem.from === user || mensagem.to === user){
                    const deletarMensagem = await db.deleteOne({_id: new ObjectId(id)});
                    console.log('deletarMensagem', deletarMensagem);
                    res.sendStatus(200);
                    await conexaoMongo.close();
                    return;
                }
                if(mensagem.from !== user && mensagem.to !== user){
                    console.log('Usuário não tem permissão para apagar mensagem');
                    res.sendStatus(401);
                    await conexaoMongo.close();
                    return;
                }
            }
            if(!mensagem){
                console.log('Mensagem não existe');
                res.sendStatus(404);
                await conexaoMongo.close();
                return;
            }
        } catch (error) {
            console.log(error);
            res.sendStatus(500);
            await conexaoMongo.close();
        }
    }
});

appServer.put('/messages/:id', async (req, res)=>{
    const {id} = req.params;
    const {to, text, type} = req.body;
    const {user} = req.headers;

    const schemaAtualizarMensagem = joi.object({
        to: joi.string().min(1).required(),
        text : joi.string().min(1).required(),
        type: joi.string().valid('message', 'private_message')
    });
    const validacao = schemaAtualizarMensagem.validate({to, text, type}, {abortEarly: false});

    if(validacao.error || !user || !id){
        console.log('Para atualizar uma mensagem é necessário informar o usuário, o id e o objeto');
        res.sendStatus(422);
        return;
    }

    if(user && id && validacao.value.to.length >= 1 && validacao.value.text.length >= 1){
        console.log('Consultando mensagem a ser atualizada');
        if(validacao.value.type === 'message' || validacao.value.type === 'private_message'){
            const conexaoMongo = new MongoClient(process.env.MONGO_CONECTION);
            try{
                const conexao = await conexaoMongo.connect();
                const db = conexao.db('API-batePapoUol').collection('participants');
                const participante = await db.findOne({name: user});

                if(participante){
                    const dbMensagens = conexao.db('API-batePapoUol').collection('messages');
                    const mensagem = await dbMensagens.findOne({_id: new ObjectId(id)});

                    if(mensagem){
                        if(mensagem.from === user){
                            const atualizarMensagem = await dbMensagens.updateOne({_id: new ObjectId(id)}, {$set: req.body});
                            console.log('atualizarMensagem', atualizarMensagem);
                            res.sendStatus(201);
                            await conexaoMongo.close();
                            return;
                        }
                        if(mensagem.from !== user){
                            console.log('Usuário não tem permissão para atualizar mensagem');
                            res.sendStatus(401);
                            await conexaoMongo.close();
                            return;
                        }
                    }
                    if(!mensagem){
                        console.log('Mensagem não existe');
                        res.sendStatus(404);
                        await conexaoMongo.close();
                        return;
                    }
                }
                if(!participante){
                    console.log('Participante não existe');
                    res.sendStatus(422);
                    await conexaoMongo.close();
                    return;
                }
            }
            catch(err){
                console.log(err);
                res.sendStatus(500);
                await conexaoMongo.close();
                return;
            }
        } else{
            console.log('Tipo de mensagem inválido');
            res.sendStatus(422);
            return;
        }
    }
});

setInterval( async ()=>{
    const conexaoListaParticipantes = new MongoClient(process.env.MONGO_CONECTION);
    try{
        const conexao = await conexaoListaParticipantes.connect();
        const db = conexao.db('API-batePapoUol').collection('participants');
        const listaParticipantesAtivos = await db.find().toArray();
        console.log('Consulta listaParticipantesAtivos', listaParticipantesAtivos);

        if(listaParticipantesAtivos.length > 0){
            const participantesColecao = [...listaParticipantesAtivos];
            console.log('participantesColecao', participantesColecao);
            const participantesOffline = participantesColecao.filter(participante=>{
                return (Date.now() - participante.lastStatus) > 10000;
            });
            console.log('participantes que podem estar offline', participantesOffline);

            if(participantesOffline.length > 0){
                const apagarParticipante = await db.deleteMany({name: {$in: participantesOffline.map(participante=>{
                    return participante.name;
                })}});
                console.log('apagarParticipante', apagarParticipante);
                const conexaoMensagens = new MongoClient(process.env.MONGO_CONECTION);
                try{
                    const conexaoDb = await conexaoMensagens.connect();
                    const arrClone = [...participantesOffline];
                    console.log('arrClone', arrClone);

                    const dbMensagemSaida = conexaoDb.db('API-batePapoUol').collection('messages');
                    const mensagemSaidaSala = await dbMensagemSaida.insertMany(arrClone.map(participante=>{
                        return {
                            from: participante.name,
                            to: 'Todos',
                            text: 'sai da sala...',
                            time: `${dayjs(Date.now()).format('HH:mm:ss')}`
                        }
                    }));
                    console.log('mensagemSaidaSala', mensagemSaidaSala);
                    await conexaoMensagens.close();
                    await conexaoListaParticipantes.close();
                    return;
                }
                catch(err){
                    console.log(err);
                    await conexaoMensagens.close();
                    await conexaoListaParticipantes.close();
                    return;
                }
            }
            if(participantesOffline.length === 0){
                console.log('Não há participantes offline');
                await conexaoListaParticipantes.close();
                return;
            }
        }
        if(listaParticipantesAtivos.length === 0){
            console.log('Não existe participantes ativos');
            await conexaoListaParticipantes.close();
            return;
        }
    }
    catch(err){
        console.log(err);
        await conexaoListaParticipantes.close();
    }
}, 15000);

appServer.listen(5000, () =>{
    console.log(chalk.green('Servidor rodando na porta: 5000'));
});
