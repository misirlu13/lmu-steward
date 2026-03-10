import React, {createContext, useContext, useState} from 'react';

interface NavbarContextType {
  content: React.ReactNode;
  setContent: (content: React.ReactNode) => void;
}

const NavbarContext = createContext<NavbarContextType>({
  content: null,
  setContent: () => {},
});

export const NavbarProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [content, setContent] = useState<React.ReactNode>(null);

  return (
    <NavbarContext.Provider value={{content, setContent}}>
      {children}
    </NavbarContext.Provider>
  );
};

export const useNavbar = () => useContext(NavbarContext);
