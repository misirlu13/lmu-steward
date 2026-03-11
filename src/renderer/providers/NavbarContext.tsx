import React, { createContext, useContext, useState } from 'react';

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

  return (
    <NavbarContext.Provider
      value={{ isViewHeaderAttached, setIsViewHeaderAttached }}
    >
      {children}
    </NavbarContext.Provider>
  );
};

export const useNavbar = () => useContext(NavbarContext);
