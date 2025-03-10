import * as React from 'react';
import PropTypes from 'prop-types';
import MuiError from '@mui/utils/macros/MuiError.macro';
import { deepmerge, unstable_useEnhancedEffect as useEnhancedEffect } from '@mui/utils';
import { GlobalStyles } from '@mui/styled-engine';
import cssVarsParser from './cssVarsParser';
import ThemeProvider from '../ThemeProvider';
import getInitColorSchemeScript, {
  DEFAULT_ATTRIBUTE,
  DEFAULT_MODE_STORAGE_KEY,
} from './getInitColorSchemeScript';
import useCurrentColorScheme from './useCurrentColorScheme';
import createGetCssVar from './createGetCssVar';

export const DISABLE_CSS_TRANSITION =
  '*{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}';

export default function createCssVarsProvider(options) {
  const {
    theme: defaultTheme = {},
    defaultMode: desisgnSystemMode = 'light',
    defaultColorScheme: designSystemColorScheme,
    disableTransitionOnChange: designSystemTransitionOnChange = false,
    enableColorScheme: designSystemEnableColorScheme = true,
    prefix: designSystemPrefix = '',
    shouldSkipGeneratingVar,
    resolveTheme,
  } = options;

  if (
    !defaultTheme.colorSchemes ||
    (typeof designSystemColorScheme === 'string' &&
      !defaultTheme.colorSchemes[designSystemColorScheme]) ||
    (typeof designSystemColorScheme === 'object' &&
      !defaultTheme.colorSchemes[designSystemColorScheme?.light]) ||
    (typeof designSystemColorScheme === 'object' &&
      !defaultTheme.colorSchemes[designSystemColorScheme?.dark])
  ) {
    console.error(`MUI: \`${designSystemColorScheme}\` does not exist in \`theme.colorSchemes\`.`);
  }
  const ColorSchemeContext = React.createContext(undefined);

  const useColorScheme = () => {
    const value = React.useContext(ColorSchemeContext);
    if (!value) {
      throw new MuiError('MUI: `useColorScheme` must be called under <CssVarsProvider />');
    }
    return value;
  };

  function CssVarsProvider({
    children,
    theme: themeProp = defaultTheme,
    prefix = designSystemPrefix,
    modeStorageKey = DEFAULT_MODE_STORAGE_KEY,
    attribute = DEFAULT_ATTRIBUTE,
    defaultMode = desisgnSystemMode,
    defaultColorScheme = designSystemColorScheme,
    disableTransitionOnChange = designSystemTransitionOnChange,
    enableColorScheme = designSystemEnableColorScheme,
  }) {
    const hasMounted = React.useRef(false);

    const { colorSchemes = {}, components = {}, ...restThemeProp } = themeProp;
    const allColorSchemes = Object.keys(colorSchemes);
    const defaultLightColorScheme =
      typeof defaultColorScheme === 'string' ? defaultColorScheme : defaultColorScheme.light;
    const defaultDarkColorScheme =
      typeof defaultColorScheme === 'string' ? defaultColorScheme : defaultColorScheme.dark;
    const {
      mode,
      setMode,
      systemMode,
      lightColorScheme,
      darkColorScheme,
      colorScheme,
      setColorScheme,
    } = useCurrentColorScheme({
      supportedColorSchemes: allColorSchemes,
      defaultLightColorScheme,
      defaultDarkColorScheme,
      modeStorageKey,
      defaultMode,
    });
    const resolvedColorScheme = (() => {
      if (!colorScheme) {
        // This scope occurs on the server
        if (defaultMode === 'dark') {
          return defaultDarkColorScheme;
        }
        // use light color scheme, if default mode is 'light' | 'auto'
        return defaultLightColorScheme;
      }
      return colorScheme;
    })();

    let theme = restThemeProp;
    const {
      css: rootCss,
      vars: rootVars,
      parsedTheme,
    } = cssVarsParser(theme, {
      prefix,
      basePrefix: designSystemPrefix,
      shouldSkipGeneratingVar,
    });

    theme = {
      ...parsedTheme,
      components,
      colorSchemes,
      prefix,
      vars: rootVars,
      getCssVar: createGetCssVar(prefix),
    };

    const styleSheet = {};

    Object.entries(colorSchemes).forEach(([key, scheme]) => {
      const {
        css,
        vars,
        parsedTheme: parsedScheme,
      } = cssVarsParser(scheme, {
        prefix,
        basePrefix: designSystemPrefix,
        shouldSkipGeneratingVar,
      });
      theme.vars = deepmerge(theme.vars, vars);
      if (key === resolvedColorScheme) {
        theme = {
          ...theme,
          ...parsedScheme,
        };
        if (theme.palette) {
          // assign runtime mode & colorScheme
          theme.palette.mode = mode;
          theme.palette.colorScheme = resolvedColorScheme;
        }
      }
      const resolvedDefaultColorScheme = (() => {
        if (typeof defaultColorScheme === 'string') {
          return defaultColorScheme;
        }
        if (defaultMode === 'dark') {
          return defaultColorScheme.dark;
        }
        return defaultColorScheme.light;
      })();
      if (key === resolvedDefaultColorScheme) {
        styleSheet[':root'] = css;
      } else {
        styleSheet[`[${attribute}="${key}"]`] = css;
      }
    });

    React.useEffect(() => {
      if (colorScheme) {
        // attaches attribute to <html> because the css variables are attached to :root (html)
        document.documentElement.setAttribute(attribute, colorScheme);
      }
    }, [colorScheme, attribute]);

    useEnhancedEffect(() => {
      if (!mode || !enableColorScheme) {
        return undefined;
      }
      const priorColorScheme = document.documentElement.style.getPropertyValue('color-scheme');
      // `color-scheme` tells browser to render built-in elements according to its value: `light` or `dark`
      if (mode === 'system') {
        document.documentElement.style.setProperty('color-scheme', systemMode);
      } else {
        document.documentElement.style.setProperty('color-scheme', mode);
      }

      return () => {
        document.documentElement.style.setProperty('color-scheme', priorColorScheme);
      };
    }, [mode, systemMode, enableColorScheme]);

    React.useEffect(() => {
      let timer;
      if (disableTransitionOnChange && hasMounted.current) {
        // credit: https://github.com/pacocoursey/next-themes/blob/b5c2bad50de2d61ad7b52a9c5cdc801a78507d7a/index.tsx#L313
        const css = document.createElement('style');
        css.appendChild(document.createTextNode(DISABLE_CSS_TRANSITION));
        document.head.appendChild(css);

        // Force browser repaint
        (() => window.getComputedStyle(document.body))();

        timer = setTimeout(() => {
          document.head.removeChild(css);
        }, 1);
      }
      return () => {
        clearTimeout(timer);
      };
    }, [colorScheme, disableTransitionOnChange]);

    React.useEffect(() => {
      hasMounted.current = true;
      return () => {
        hasMounted.current = false;
      };
    }, []);

    return (
      <ColorSchemeContext.Provider
        value={{
          mode,
          setMode,
          lightColorScheme,
          darkColorScheme,
          colorScheme,
          setColorScheme,
          allColorSchemes,
        }}
      >
        <GlobalStyles styles={{ ':root': rootCss }} />
        <GlobalStyles styles={styleSheet} />
        <ThemeProvider theme={resolveTheme ? resolveTheme(theme) : theme}>{children}</ThemeProvider>
      </ColorSchemeContext.Provider>
    );
  }

  CssVarsProvider.propTypes = {
    /**
     * The body attribute name to attach colorScheme.
     */
    attribute: PropTypes.string,
    /**
     * The component tree.
     */
    children: PropTypes.node,
    /**
     * The initial color scheme used.
     */
    defaultColorScheme: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    /**
     * The initial mode used.
     */
    defaultMode: PropTypes.string,
    /**
     * Disable CSS transitions when switching between modes or color schemes
     */
    disableTransitionOnChange: PropTypes.bool,
    /**
     * Indicate to the browser which color scheme is used (light or dark) for rendering built-in UI
     */
    enableColorScheme: PropTypes.bool,
    /**
     * The key in the local storage used to store current color scheme.
     */
    modeStorageKey: PropTypes.string,
    /**
     * CSS variable prefix.
     */
    prefix: PropTypes.string,
    /**
     * The calculated theme object that will be passed through context.
     */
    theme: PropTypes.object,
  };

  return { CssVarsProvider, useColorScheme, getInitColorSchemeScript };
}
