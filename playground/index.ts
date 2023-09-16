import { Buchta } from "../src/buchta.ts";
import { css } from "../plugins/css";
import { vue } from "../plugins/vue";
import Elysia, { LocalHandler } from "elysia";
import { existsSync, rmSync } from "fs";
import { basename, dirname } from "path";
import { getFiles } from "../src/utils/fs";

interface BuxConfig {
    port: number;
    ssr: boolean;
}
const config: BuxConfig = {port: 3000, ssr: true}

export const port = ( app: Elysia ) => {
    let port = Number( Bun.env.port || config.port ) || 3030;
    app.listen( port );
    return app;
};

const extraRoutes = new Map<string, Function>();

// This is a hook for files that doesn't have a plugin like pngs
const earlyHook = ( build: Buchta ) => {
    build.on( "fileLoad", ( data ) => {
        data.route = "/" + basename( data.path );
        const func = async ( _: any ) => {
            return Bun.file( data.path );
        };

        extraRoutes.set( data.route, func );
    } );
};

// This function will fix route so elysia won't behave abnormally 
const fixRoute = ( route: string, append = true ) => {
    if ( !route.endsWith( "/" ) && append )
    {
        route += "/";
    }

    const matches = route.match( /\[.+?(?=\])./g );
    if ( matches )
    {
        for ( const match of matches )
        {
            route = route.replace( match, match.replace( "[", ":" ).replace( "]", "" ) );
        }
    }

    return route;
};

const fsRouter = ( app: Elysia ) => {
    const files = getFiles( process.cwd() + "/server" );
    for ( const file of files )
    {
        const path = file.replace( process.cwd() + "/server", "" );
        const count = path.split( "." ).length - 1;
        if ( count == 1 )
        {
            const route = path.split( "." )[ 0 ];
            const mod = require( file );
            const func = mod.default;
            app.get( fixRoute( "/api" + route, false ), func, mod );
        } else if ( count == 2 )
        {
            const [ route, method, _ext ] = path.split( "." );
            const mod = require( file );
            const func = mod.default;
            // @ts-ignore
            app[ method ]( fixRoute( "/api" + route, false ), func, mod );
        }
    }
};


export async function bux ( app: Elysia ) {
    const outdir = '.banh';
    if ( existsSync( process.cwd() + `/${ outdir }/` ) )
        rmSync( process.cwd() + `/${ outdir }/`, { recursive: true } );
    // this will prevent piling up files from previous builds

    const buchta = new Buchta( false, {
        port: config.port,
        ssr: config.ssr,
        rootDir: process.cwd(),
        dirs: [ "public/ahoj" ],
        plugins: [ vue(), css() ],
        outdir

    } );

    buchta.earlyHook = earlyHook;

    // fsRouter(app);

    await buchta.setup();


    for ( const [ route, func ] of extraRoutes )
    {
        // @ts-ignore ssh
        app.get( route, func );
    }

    for ( const route of buchta.pages )
    {
        if ( route.func )
        {
            app.get( fixRoute( dirname( route.route! ) ), async ( _: any ) => {
                return new Response( await route.func!( dirname( route.route! ), fixRoute( dirname( route.route! ) ) ),
                    { headers: { "Content-Type": "text/html" } } );
            } );
        } else
        {
            if ( !config.ssr && "html" in route )
            {
                app.get( fixRoute( dirname( route.route! ) ), ( _: any ) => {
                    return new Response( route.html, { headers: { "Content-Type": "text/html" } } );
                } );
            }

            if ( !( "html" in route ) )
            {
                app.get( route.route!, () => Bun.file( route.path! ) );
                app.get( route.originalRoute!, () => Bun.file( route.path! ) );
            }
        }
    }
    buchta.logger.box( `listening on http://${ app.server?.hostname }:${ app.server?.port }` );
    return app;
}

