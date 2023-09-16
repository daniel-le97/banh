import { Hookable } from 'hookable';
import { BuchtaLogger } from './logger.ts';
import { Consola, consola, createConsola } from 'consola';

const hooks = {
    build: ( hi: string ) => console.log( hi )


};

interface Hooker {
    gen: ( message: string ) => void;
    build: ( ...args: string[] ) => any;
    transpile: ( message: string ) => void;
    compile: ( message: string ) => void;
}


export class Eventer extends Hookable<Hooker> {
    /**
     *
     */
    consola: Consola
    constructor () {
        super();
        this.consola = consola
        this.hook( 'gen', ( message: string ) => console.log( 'generated' + '-' + message ) );
        this.addHooks( {
            transpile ( message ) {
                consola.log( message );
            },
            build ( ...args ) {
                return args
            },

        } );
        this.beforeEach( ( event ) => { consola.start( `${ event.name } starting...` ); } );
        this.afterEach( ( event ) => { consola.success( `${ event.name } ending...` ); } );


    }
}
const events = new Eventer();

const building = await events.callHook( 'build', 'cats', 'dogs' );

consola.box( building);