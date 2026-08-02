import React, { createContext, useContext, useMemo, useState } from 'react';

interface NavbarContextType {
  isViewHeaderAttached: boolean;
  setIsViewHeaderAttached: (isViewHeaderAttached: boolean) => void;
}

const NavbarContext = createContext<NavbarContextType>({
  isViewHeaderAttached: false,
  setIsViewHeaderAttached: () => {},
});

export const NavbarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isViewHeaderAttached, setIsViewHeaderAttached] =
    useState<boolean>(false);

  const contextValue = useMemo(
    () => ({ isViewHeaderAttached, setIsViewHeaderAttached }),
    [isViewHeaderAttached],
  );

  return (
    <NavbarContext.Provider value={contextValue}>
      {children}
    </NavbarContext.Provider>
  );
};

export const useNavbar = () => useContext(NavbarContext);
